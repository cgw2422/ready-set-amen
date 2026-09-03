# Deploying Ready. Set. Amen. to Railway

Everything in the repo is already configured for Railway — `railway.json`,
the boot sequence, the health check, and `$PORT` binding. What is left is the
part that needs your Railway account.

**Time: about 5 minutes.**

---

## 1. Create the project

1. Go to [railway.com/new](https://railway.com/new) → **Deploy from GitHub repo**.
2. Pick **`cgw2422/ready-set-amen`**.
3. Set the branch to **`claude/ready-set-amen-mobile-nnyifi`**
   (Settings → Source → Branch), or merge that branch to `main` first.

The first build will run and then fail its health check — that is expected until
step 2 gives it a database.

## 2. Add Postgres

In the project canvas: **+ New → Database → Add PostgreSQL**.

## 3. Set variables on the app service

Open the app service → **Variables**:

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | `${{Postgres.DATABASE_URL}}` — type it exactly; it is a reference, not a literal |
| `APP_URL` | no | Your public URL, e.g. `https://your-app.up.railway.app`. Leave unset and the app uses Railway's `RAILWAY_PUBLIC_DOMAIN`; set it explicitly once you add a custom domain, because waiver links are built from it. |
| `MARKETING_HOST` | once you have domains | `readysetamen.com` — leave unset and one host serves everything |
| `APP_HOST` | with the above | `app.readysetamen.com` |
| `STRIPE_SECRET_KEY` | to sell anything | See [docs/PRICING-AND-DOMAINS.md](./PRICING-AND-DOMAINS.md) |
| `STRIPE_WEBHOOK_SECRET` | to grant access | The signing secret for your webhook endpoint |
| `RESEND_API_KEY` | recommended | Transactional email. Waivers and invitations work fine without it via Copy Link — but **self-service password reset needs it to deliver**. Without email, an owner issues reset links from organization settings instead. |
| `MAIL_FROM` | with the above | e.g. `Ready Set Amen <trips@yourchurch.org>` |

Nothing else is needed. There is no auth vendor, no e-signature vendor, no SMS,
and no AI service to configure — `DATABASE_URL` is the only hard requirement.

**On email:** Resend's free tier covers a single church comfortably and is the
only optional dependency. Set it if you can; the app degrades honestly without
it rather than pretending an email was sent.

## 4. Generate the public domain

App service → **Settings → Networking → Generate Domain**. Port **8080** if it
asks (the app binds whatever `$PORT` Railway sets, so any value works).

You now have a URL like `https://ready-set-amen-production.up.railway.app`.

## 5. Redeploy and watch the logs

Deployments → **Redeploy**. A healthy boot logs, in order:

```
→ Applying database migrations
→ Starting Ready. Set. Amen. on 0.0.0.0:8080
✓ Ready
```

Boot does two things and no more: migrate, then serve. It never writes demo or
sample data — see [the demo guide](./DEMO.md) if you want the showcase
organization, which is created deliberately with a command you run.

Confirm it with `https://<your-domain>/api/health`, which should return:

```json
{ "status": "ok", "database": "connected" }
```

## 6. Create your account

Open `https://<your-domain>/signup` and create the first owner account for your
church. Nothing is pre-loaded, so this account and its organization are the only
things in the database.

Optionally set `APP_URL` to your final domain (especially if you add a custom
domain later, since signing links must point at the domain parents will open).

---

## Domains and payment

Point `@` and `app` at this one service as custom domains, then set
`MARKETING_HOST` and `APP_HOST`. `www` needs no custom domain — redirect it to
the apex at your DNS provider instead, and check the redirect works over https. Stripe needs a webhook at `https://app.readysetamen.com/api/stripe/webhook`
for `checkout.session.completed`. Both are covered in
**[docs/PRICING-AND-DOMAINS.md](./PRICING-AND-DOMAINS.md)**.

Neither is required to deploy: without the host variables one domain serves
both the marketing page and the app, and without the Stripe keys the app runs
normally and the unlock page says purchasing is not available yet.

## The demo organization

There is a permanent showcase church — **Ready Set Amen Demo Church** with an
**Ohio Youth Convention** trip of 50 fictional people, sitting at 91% ready with
a real punch list still to work through. It is not created by deploying; you
create it once, on purpose:

```bash
DEMO_PASSWORD='<a strong password you choose>' npm run demo:seed
```

Full instructions, the reset command, and what is in it: **[docs/DEMO.md](./DEMO.md)**.

## Testing the parent waiver flow from a phone

1. Sign in on your laptop → the trip → **Waivers**.
2. Tap **Copy link** on any student (or **Copy links for all unsigned**).
3. Send that link to your own phone.
4. Open it **without logging in** — ideally in a private window, to prove no
   session is involved.

You should see "Signing for: <student>", complete it in about a minute, and get
the **You're all set!** screen. Back on the laptop, the waiver dashboard shows
the signature, and opening the link a second time shows "This signing link is no
longer available."

---

## What the platform is actually running

| Concern | How it is handled |
| --- | --- |
| Port | `next start -H 0.0.0.0 -p $PORT` via `scripts/railway-start.mjs` |
| Migrations | `prisma migrate deploy` on every boot — idempotent |
| Health check | `/api/health`, which queries the database, so "Node started but Postgres isn't attached" reads as unhealthy rather than healthy |
| Failure mode | If migrations fail, boot fails loudly instead of serving a broken app |
| Signing-link host | `APP_URL`, else `RAILWAY_PUBLIC_DOMAIN`, else localhost |
| Secure cookies | `Secure` + `httpOnly` + `SameSite=Lax` in production; Railway terminates TLS, so this works out of the box |

## Cost

Postgres plus one small web service. There are no per-user, per-signature, or
per-message costs anywhere in the stack — no auth vendor, no e-signature vendor,
no SMS, no AI.

---

## Troubleshooting

**Health check fails, logs say the database is unreachable.**
`DATABASE_URL` is probably a literal instead of the reference. It must read
exactly `${{Postgres.DATABASE_URL}}`.

**Waiver links point at `localhost`.**
The domain was generated after the last boot. Redeploy, or set `APP_URL`
explicitly to your domain.

**Login appears to do nothing.**
Session cookies are `Secure` in production, so the app must be reached over
`https://`. Use the generated Railway domain, not a raw IP or `http://`.

**I want the sample trip back the way it started.**
Run `DEMO_PASSWORD='…' npm run demo:reset`. It rebuilds only the demo
organization; every real church in the database is untouched. See
[docs/DEMO.md](./DEMO.md).
