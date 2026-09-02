import { prisma } from "@/lib/db";

/**
 * Rate limiting.
 *
 * Two backends behind one interface:
 *
 *  - `rateLimit()` is the one to call. It uses a Postgres fixed-window counter,
 *    so several app instances share one budget. The whole check is a single
 *    atomic upsert, which is what makes it correct under concurrency without
 *    Redis and without a transaction.
 *  - `rateLimitInMemory()` is the per-process fallback used when the database
 *    is unreachable. It is weaker (per instance) but keeps some protection in
 *    place rather than failing wide open on a database hiccup.
 *
 * Fixed windows, not sliding: an attacker can burst across a window boundary at
 * up to 2x the limit. For login and signing-token guesses that is irrelevant —
 * the numbers are small — and it buys a single-round-trip check.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweepMemory(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 3_600_000) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/** Per-process sliding window. Exported for tests and as the fallback path. */
export function rateLimitInMemory(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweepMemory(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

/**
 * Shared Postgres fixed-window counter.
 *
 * The upsert both increments and resets the window in one statement: if the
 * stored window matches the current one we add to it, otherwise we start a new
 * window at 1. `RETURNING count` gives us the post-increment value, so the
 * decision needs no second read.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs * 2);

  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO rate_limit_counters ("key", "windowStart", "count", "expiresAt")
      VALUES (${key}, ${BigInt(windowStart)}, 1, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN rate_limit_counters."windowStart" = ${BigInt(windowStart)}
          THEN rate_limit_counters."count" + 1
          ELSE 1
        END,
        "windowStart" = ${BigInt(windowStart)},
        "expiresAt" = ${expiresAt}
      RETURNING "count"
    `;

    const count = Number(rows[0]?.count ?? 1);

    // Opportunistic cleanup; cheap and keeps the table from growing forever
    // without needing a scheduled job.
    if (Math.random() < 0.01) {
      await prisma.rateLimitCounter
        .deleteMany({ where: { expiresAt: { lt: new Date() } } })
        .catch(() => undefined);
    }

    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
      };
    }
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
  } catch {
    // Never log the key — it contains an IP address and sometimes an email.
    return rateLimitInMemory(key, limit, windowMs);
  }
}

/**
 * Reads a counter without incrementing it.
 *
 * Used for login, where the budget should only be spent by *failed* attempts:
 * a youth pastor signing in correctly on their phone, laptop and the church
 * office computer is not a brute-force attempt, and charging them for it locks
 * out the legitimate user while barely inconveniencing an attacker.
 */
export async function rateLimitPeek(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;

  try {
    const row = await prisma.rateLimitCounter.findUnique({
      where: { key },
      select: { windowStart: true, count: true },
    });
    const count = row && Number(row.windowStart) === windowStart ? row.count : 0;
    if (count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
      };
    }
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

export const LIMITS = {
  /** Signing-token lookups — the main anti-enumeration control. */
  signingTokenLookup: { limit: 30, windowMs: 10 * 60_000 },
  /** Actually submitting a signature. */
  signingSubmit: { limit: 10, windowMs: 10 * 60_000 },

  /**
   * Login is limited on two axes, and they are deliberately different sizes.
   *
   * The per-account limit is the real brute-force control: ten guesses at one
   * person's password per fifteen minutes. The per-IP limit only exists to
   * catch spraying across many accounts, so it is set far higher — an entire
   * church shares one NAT address on the building wifi, and a limit tight
   * enough to stop a single attacker would lock out a youth staff meeting.
   */
  loginPerAccount: { limit: 10, windowMs: 15 * 60_000 },
  loginPerIp: { limit: 100, windowMs: 15 * 60_000 },

  /** Sign-up is per IP only; a church creating several accounts is normal. */
  signup: { limit: 20, windowMs: 60 * 60_000 },
} as const;
