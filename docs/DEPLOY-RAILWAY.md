# Deploying Ready. Set. Amen. to Railway

Everything in the repo is already configured for Railway — `railway.json`,
the boot sequence, the health check, `$PORT` binding, and demo data. What is
left is the part that needs your Railway account.

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
| `SEED_DEMO_DATA` | no | `true` — loads the 50-person demo trip so you can test immediately. **Delete it after your first look.** |
| `APP_URL` | no | Your public URL, e.g. `https://your-app.up.railway.app`. Leave unset and the app uses Railway's `RAILWAY_PUBLIC_DOMAIN`; set it explicitly once you add a custom domain, because waiver links are built from it. |
| `RESEND_API_KEY` | no | Optional transactional email. Without it, leaders use Copy Link, which is the primary flow. |
| `MAIL_FROM` | no | Required only if `RESEND_API_KEY` is set, e.g. `Ready Set Amen <trips@yourchurch.org>` |

Nothing else is needed. There is no auth vendor, no e-signature vendor, no SMS,
and no AI service to configure — `DATABASE_URL` is the only hard requirement.

## 4. Generate the public domain

App service → **Settings → Networking → Generate Domain**. Port **8080** if it
asks (the app binds whatever `$PORT` Railway sets, so any value works).

You now have a URL like `https://ready-set-amen-production.up.railway.app`.

## 5. Redeploy and watch the logs

Deployments → **Redeploy**. A healthy boot logs, in order:

```
→ Applying database migrations
→ Loading demo data (SEED_DEMO_DATA is set)
Seeded.
  Sign in at https://<your-domain>/login
  Email:    leader@example.church
  Password: readysetamen2026
→ Starting Ready. Set. Amen. on 0.0.0.0:8080
✓ Ready
```

Confirm it with `https://<your-domain>/api/health`, which should return:

```json
{ "status": "ok", "database": "connected" }
```

## 6. Turn the seed off

Once you have looked around, **delete the `SEED_DEMO_DATA` variable**. While it
is set, every deploy rebuilds the demo organization. It only ever touches the
organization with slug `grace-community-demo`, so your real trips are never
affected — but there is no reason to keep reloading it.

Optionally set `APP_URL` to your final domain (especially if you add a custom
domain later, since signing links must point at the domain parents will open).

---

## Demo login

```
https://<your-domain>/login
Email:    leader@example.church
Password: readysetamen2026
```

That account owns **Grace Community Church** with a **Summer Mission Trip**:
50 people (42 students, 8 leaders), families with several children on the same
trip, a real waiver template with 16 signed and 25 not yet sent, 7 vehicles,
14 rooms, four days of schedule, partial payments, medical and allergy records,
and a preparation checklist.

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

**Demo data came back after a deploy.**
`SEED_DEMO_DATA` is still set. Delete the variable.
