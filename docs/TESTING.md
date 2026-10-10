# Testing

## Automated tests (53 passing, `apps/server`)

Run with `npm run test:server` from the repo root, or `npx vitest run` from
`apps/server`. Each test file gets an isolated in-memory SQLite DB and a
scratch temp directory (`src/__tests__/setup.ts`) — no test touches the
real dev database or the real sandboxed files root.

- `scheduleParser.test.ts` (5) — recurrence-phrase → cron parsing.
- `planner.test.ts` (4) — template matching, risk labeling, the
  unsupported-request fallback.
- `tools.test.ts` (8) — SSRF guard, path-traversal guard + real file moves
  (+ dry-run), `diff_snapshot` change detection and per-automation
  isolation, and `notifyTool`'s honest no-SMTP behavior with the correct
  recipient resolved from the automation's creator.
- `ssrfGuard.test.ts` (7) — loopback/private-range rejection including the
  bracketed-IPv6-literal case this suite caught as a real bug (see
  `docs/SECURITY.md`).
- `engine.test.ts` (5) — approval gate pause/resume, rejection cancels the
  run, the risk **safety net** (tool's own risk wins over a mislabeled
  step), retry-then-fail with the real error surfaced, and usage-event
  recording for LLM calls made mid-run.
- `auth.test.ts` (21) — **real HTTP integration tests** via `supertest`
  against the actual Express app (`createApp()`, not a mock): registration
  (incl. the first-user-becomes-owner rule), duplicate-email/weak-password
  rejection, login success/failure/lockout without account enumeration,
  refresh-token rotation and replay rejection, logout, `/auth/me` auth
  requirement, workspace-role enforcement (a viewer can read automations
  but not create one), system-admin gating (owner vs. admin vs. member,
  including that only an owner can grant owner), suspension taking effect
  on the very next request, and **cross-tenant isolation** (an automation
  created in workspace A is a 404, not a leak, to a user of workspace B).
  Plus unit tests for `requireAuth`/`validateBody` in isolation.
- `integration.test.ts` (3) — the full core loop (describe → plan →
  activate → run → pause-for-approval → approve → succeeded, and the
  reject/idempotency variants) driven entirely through real HTTP requests
  against the file-organize template, with real filesystem assertions
  (files actually move, or don't, depending on the approval decision).

## A real bug this test-writing pass caught

While writing `auth.test.ts`'s workspace-role test, a non-admin user's
`GET /api/automations` came back `403 Requires system admin` — from a
completely unrelated router. Root cause: `adminRouter()` was mounted at the
same bare `/api` prefix as every other router, and its router-level
`requireSystemAdmin` middleware (no path scoping) runs for *every* request
Express dispatches into that router, not just ones matching its own
routes — so it was silently intercepting and rejecting requests meant for
`automationsRouter`, mounted later in the stack. Fixed by giving
`adminRouter` its own `/api/admin` mount prefix (see `docs/SECURITY.md` and
`apps/server/src/app.ts`). This is exactly the kind of bug that real
integration tests catch and unit tests or code review alone would likely
miss — the individual middleware functions were each correct in isolation.

## Manual end-to-end verification (headless browser, full production build)

`apps/server/scripts/ui-smoke-test.mjs` drives the actual built Next.js app
against the actual built/running server via real Chromium (Playwright),
covering in one run: register (becomes instance owner) → dashboard →
describe a task → generate plan → activate → run now → pending-approval
screen → approve → succeeded, with real file-move side effects → profile
settings → workspace rename/members → send an invite (and see the honest
"email not sent, here's the link" fallback when SMTP isn't configured) →
create an API key (shown once) → AI provider settings → admin overview →
admin users tab → notifications page → log out → confirming a logged-out
visit to a protected route redirects to `/login`. All steps passed against
the real server, real SQLite database, and real filesystem.

## What "no fake functionality" means here, concretely

- The local AI provider is labeled in its own source comment as a
  heuristic, not a real model — the UI never claims otherwise.
- `notify`/invites/password-reset never claim to have sent an email when
  SMTP isn't configured; they report exactly what happened and return a
  shareable link/token instead.
- Every button in every page (auth, settings, admin, the core automation
  loop) calls a real backend endpoint verified above — none is a
  placeholder, and the admin panel's user/workspace/audit/usage data is
  read from the real database, not mocked.
- Unused schema (the `credentials` table, `totp_*` columns) is left
  genuinely unused rather than wired to a UI control that wouldn't do
  anything real — see `docs/SECURITY.md`.
