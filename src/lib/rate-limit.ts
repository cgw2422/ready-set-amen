/**
 * In-process sliding-window rate limiter.
 *
 * Deliberately simple for V1 (see docs/ARCHITECTURE.md §5): it is per-instance,
 * which is correct on a single server and degrades gracefully to "limit per
 * instance" when scaled horizontally. The interface is what a Postgres or Redis
 * backed limiter would expose, so swapping it later is a one-file change.
 */

type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
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

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

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

export const LIMITS = {
  /** Signing-token lookups — the main anti-enumeration control. */
  signingTokenLookup: { limit: 30, windowMs: 10 * 60_000 },
  /** Actually submitting a signature. */
  signingSubmit: { limit: 10, windowMs: 10 * 60_000 },
  login: { limit: 10, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
} as const;
