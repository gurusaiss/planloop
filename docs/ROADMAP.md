# Roadmap

## Built

- Core loop: describe → plan → review → activate → run → approval-gate →
  verify → result, fully working end-to-end.
- Two planner templates: website-monitor+notify, file-organize.
- Tools: `http_fetch_extract`, `browser_snapshot` (Playwright), `diff_snapshot`,
  `summarize_text`, `file_organize`, `notify`.
- Provider abstraction with local (zero-cost) default + OpenAI/Anthropic/
  Gemini adapters, configurable instance-wide (env) or **per-workspace**
  (Settings → AI Providers, encrypted at rest).
- SQLite persistence, cron-based scheduling, retries, approval workflow.
- **Real multi-user accounts & multi-tenancy**: email/password with hashed
  storage, JWT + rotating refresh-token sessions, lockout, password reset;
  workspaces with roles (owner/admin/member/viewer), email invites, API
  keys; every table and route scoped by workspace. See `docs/SECURITY.md`.
- **Instance admin panel**: every user/workspace, suspend/activate/promote
  users, audit log, usage stats — gated by system role.
- Production hardening: zod validation, required-field validation at the
  tool boundary, DNS-resolution SSRF protection, `helmet`, restricted CORS,
  rate limiting, centralized async error handling, graceful shutdown,
  Dockerfiles + docker-compose, fail-fast production env checks.
- 53 automated tests (including real HTTP integration tests of the whole
  auth/tenancy system — see `docs/TESTING.md`) + a full headless-browser
  smoke test covering every page.

## V1 (next)

- Real SMTP wiring exists (`lib/mailer.ts`) but needs you to actually
  configure a provider — see `MANUAL_STEPS.md`.
- Third planner template chosen from `docs/RESEARCH.md`'s problem inventory
  (recurring multi-source report, or cross-app data sync) based on real usage
  of the two shipped templates.
- Full JSON-Schema/type-level validation of tool input *values* (today only
  required-field presence is enforced — see `docs/SECURITY.md`).
- `condition`/`loop`/`parallel`/`delay` step kinds actually executed
  (currently no-ops in the type system — see `docs/WORKFLOWS.md`).
- Workflow editor UI for editing a generated plan before activating it
  (today the plan is accept-as-generated or don't activate).

## V2

- Credential vault (encrypted, OAuth where applicable) so tools can act on
  a user's actual third-party accounts, not just public web pages/local
  files — distinct from the already-implemented workspace AI-provider keys.
- Move off SQLite to Postgres once single-writer throughput becomes a real
  constraint (multi-tenancy itself is already implemented, not blocked on this).
- 2FA (schema has reserved, unused columns for this — see `docs/SECURITY.md`).
- Additional specialized agents only where they earn their complexity (see
  `docs/AGENTS.md`) — e.g. a dedicated Research Agent once multi-source
  synthesis is a real, requested use case.
- Usage-based billing on top of the usage-tracking that already exists
  (`usage_events` table, `/api/admin/usage`) — tracking is built, billing
  logic is not.

## Long-term platform

- Browser extension / desktop agent for workflows that need a real logged-in
  browser session (the current sandboxed Playwright tool intentionally
  never carries user session cookies).
- Self-hosted deployment story for privacy-sensitive teams (n8n-style),
  building on the fact that the app already runs fully locally.
- Additional trigger types: webhook, file-watch, email-in.
- Pricing tiers on top of the existing workspace model (see `docs/PRODUCT.md`).

## Deliberately not planned

- Full computer-use/vision-based agents as a v1/v2 feature — per
  `docs/RESEARCH.md`, this space is still unstable at the frontier-lab level
  (two OpenAI products discontinued within a year); revisit only once a
  provider-agnostic abstraction can wrap it without lock-in.
- Autonomous execution of high-risk actions without approval — this is a
  permanent product principle, not a temporary limitation.
