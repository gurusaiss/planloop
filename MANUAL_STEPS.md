# Manual Steps — What You Need to Do

Everything code-level is done and tested. This file is the checklist of
things that only you can do — decisions, accounts, secrets, and the actual
"push it live" step, which was deliberately never done automatically.

## 1. Right now (nothing, if you just want to try it locally)

The app already runs with zero configuration: no API keys, no accounts, no
payment method. See `docs/SETUP.md`. Skip everything below until you
actually want to (a) use a real AI provider, (b) send real emails, or
(c) put it on the internet.

## 2. If you want real AI instead of the local heuristic (optional)

The local provider is honest-but-basic (extractive summarization, not a
real model). To get real natural-language understanding and better
summaries, either as the instance-wide default or per-workspace:

**Per-workspace** (no restart needed): open **Settings → AI Providers** in
the app, paste an API key for OpenAI/Anthropic/Gemini, and mark it default.
That workspace now uses it immediately.

**Instance-wide default** (used by any workspace that hasn't configured
its own):
1. Get an API key from **one** of:
   - OpenAI: https://platform.openai.com/api-keys
   - Anthropic: https://console.anthropic.com/settings/keys
   - Google Gemini: https://aistudio.google.com/apikey
2. Put it in your `.env` as `OPENAI_API_KEY=...` (or the matching var).
3. Restart the server.

## 3. Before running anywhere other than your own machine

These two matter most — the app refuses to start in production without them.

1. **Generate real secrets**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # JWT_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # ENCRYPTION_KEY
   ```
   Put both in `.env`. Without `JWT_SECRET`, sessions reset on every
   restart. Without `ENCRYPTION_KEY`, any workspace AI-provider key someone
   saves won't survive a restart either (it can't be decrypted with a
   freshly-generated dev key). Set `NODE_ENV=production` and the server
   will refuse to boot rather than run insecurely if either is missing.
2. **Set `CORS_ORIGIN`** to the actual URL your frontend will be served
   from (e.g. `https://automations.yourdomain.com`). It defaults to
   `http://localhost:3000` and the API will reject browser requests from
   any other origin.
3. **Set `APP_URL`** to your real frontend URL — it's used to build the
   links inside password-reset and workspace-invite emails.
4. Create your account normally (register) — the very first account on a
   fresh instance becomes the instance owner with admin-panel access.
   There is no separate admin bootstrap step.

## 4. If you want real email (password resets, invites, notifications)

Without SMTP configured, the app is still fully functional — it honestly
reports that no email was sent and gives you the link/token to share
manually (shown directly in the UI for invites, logged server-side for
password resets). To send real email:
1. Get SMTP credentials from a provider (e.g. a free tier of Resend,
   SendGrid, Mailgun, or your own mail server).
2. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in
   `.env`. No code changes needed — `lib/mailer.ts` picks it up automatically
   and is already wired into password reset, workspace invites, and the
   `notify` tool.

## 5. Choosing where to actually deploy it

Nothing was deployed anywhere. You need to decide **where**. Realistic
options, cheapest first:

| Component | Needs | Good free/cheap options |
|---|---|---|
| Backend (`apps/server`) | A long-running Node process + persistent disk (SQLite file) + enough RAM/CPU for a headless Chromium instance | Railway, Render, Fly.io — all support Docker deploys with a persistent volume on their free/starter tiers |
| Frontend (`apps/web`) | Just needs to run `next start` and reach the backend's public URL | Vercel (free tier, first-party Next.js host) — set `NEXT_PUBLIC_API_URL` to your backend's public URL as a build-time env var |

The `Dockerfile`s and `docker-compose.yml` in this repo are written and
reviewed for correctness, but **I could not actually build/run them in this
development sandbox** — it has a Docker client installed but no Docker
daemon (and network access is restricted). Before trusting them in
production:
```bash
docker compose build
docker compose up
```
and confirm both containers come up cleanly on a machine you control (or
your CI) before deploying for real. If something's off, tell me the error
and I'll fix it — I'd rather flag this honestly than claim it's verified
when it isn't.

## 6. Domain & HTTPS (if you want a real URL)

- Buy/point a domain at whichever host you choose in step 5 (most of them —
  Vercel, Railway, Render, Fly — issue free HTTPS certificates
  automatically once you add a custom domain in their dashboard).
- Update `CORS_ORIGIN` (backend) and `NEXT_PUBLIC_API_URL` (frontend build)
  to the real domains once you have them.

## 7. Backups (once you have real data you care about)

SQLite is a single file (`apps/server/data/app.db`). Back it up like any
file — e.g. a scheduled `cp`/`rsync` to object storage, or your hosting
provider's volume-snapshot feature if it has one. There's no automated
backup job in this MVP.

## 8. When you're ready to push this to GitHub

I have **not** created any GitHub repository or pushed anything, per your
instruction. When you're ready:
1. Create the (empty) GitHub repository yourself, or tell me to create it.
2. Give me the repo URL and say something like *"push this project to
   `<url>`"*.
3. I'll inspect it, check `.gitignore` covers `.env`/`data/`/`node_modules`
   (it already does), review the diff, commit, and push — and report back
   exactly what was pushed.

## 9. Things that need a product/business decision from you, not code

- Which AI provider to standardize on (cost vs. quality vs. privacy — see
  `docs/COSTS.md` and `docs/RESEARCH.md`).
- Pricing model, if you intend to charge anyone (see `docs/PRODUCT.md` for
  the research-backed recommendation: transparent execution-based pricing,
  not opaque credits).
- Whether/when to move off SQLite to Postgres — only needed at a scale
  where a single-writer SQLite file becomes a bottleneck (real
  multi-tenancy is already implemented on top of SQLite today).
- Whether to open-source it (an explicit differentiation angle per the
  research — "self-hosted" is a credible trust signal against cloud-only
  competitors).

## Summary checklist

- [ ] Decide if you want a real AI provider; add its API key if so (instance-wide or per-workspace)
- [ ] Generate and set a real `JWT_SECRET` and `ENCRYPTION_KEY`
- [ ] Set `CORS_ORIGIN` and `APP_URL` to your real frontend URL
- [ ] Decide on real SMTP for invites/password-reset/notification emails
- [ ] Pick a hosting provider for the backend (Docker + persistent volume)
- [ ] Pick a hosting provider for the frontend (Vercel is the easy default)
- [ ] Actually run `docker compose build && docker compose up` once,
      somewhere with a Docker daemon, before trusting it in production
- [ ] Point a domain at it, if you want one
- [ ] Set up a backup for the SQLite file once real data exists
- [ ] Give me a GitHub repo URL + explicit "push it" instruction when ready
