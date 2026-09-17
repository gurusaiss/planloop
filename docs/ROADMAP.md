# Roadmap

## MVP (built, this session)

- Describe → plan → review → activate → run → approval-gate → verify →
  result loop, fully working end-to-end.
- Two planner templates: website-monitor+notify, file-organize.
- Tools: `http_fetch_extract`, `browser_snapshot` (Playwright), `diff_snapshot`,
  `summarize_text`, `file_organize`, `notify`.
- Provider abstraction with local (zero-cost) default + OpenAI/Anthropic/
  Gemini adapters.
- SQLite persistence, cron-based scheduling, retries, approval workflow.
- Automated tests (20 passing) + a real headless-browser UI smoke test.
- **Production hardening** (added in a follow-up pass): single-user bearer
  auth on every route, zod body validation, required-field validation at
  the tool boundary, DNS-resolution-based SSRF protection, `helmet`
  security headers, restricted CORS, per-route rate limiting, centralized
  async error handling, graceful shutdown, Dockerfiles + docker-compose,
  fail-fast production env checks. See `docs/SECURITY.md`.

## V1 (next)

- Real email delivery for `notify` (SMTP wiring, currently intentionally
  stubbed — see `docs/COSTS.md`).
- Third planner template chosen from `docs/RESEARCH.md`'s problem inventory
  (recurring multi-source report, or cross-app data sync) based on real usage
  of the two shipped templates.
- Usage tracking (model calls, tokens, execution time) per Section 33 of the
  brief — foundation for future plan tiers, not billing itself.
- Full JSON-Schema/type-level validation of tool input *values* (today only
  required-field presence is enforced — see `docs/SECURITY.md`).
- Multi-user accounts (today's auth is single bearer-token, not per-user).

## V2

- Multi-tenant orgs/workspaces with enforced isolation (Postgres + RLS,
  replacing the single-workspace SQLite MVP).
- Credential vault (encrypted, OAuth where applicable) so tools can act on
  a user's actual accounts, not just public web pages/local files.
- Additional specialized agents only where they earn their complexity (see
  `docs/AGENTS.md`) — e.g. a dedicated Research Agent once multi-source
  synthesis is a real, requested use case.
- Workflow editor UI for editing a generated plan before activating it
  (today the plan is accept-as-generated or don't activate).
- `condition`/`loop`/`delay` step kinds actually executed (currently no-ops
  in the type system — see `docs/WORKFLOWS.md`).

## Long-term platform

- Browser extension / desktop agent for workflows that need a real logged-in
  browser session (the current sandboxed Playwright tool intentionally
  never carries user session cookies).
- Self-hosted deployment story for privacy-sensitive teams (n8n-style),
  building on the fact that the MVP already runs fully locally.
- Additional trigger types: webhook, file-watch, email-in.
- Team plans, usage-based pricing tiers (see `docs/PRODUCT.md`).

## Deliberately not planned

- Full computer-use/vision-based agents as a v1/v2 feature — per
  `docs/RESEARCH.md`, this space is still unstable at the frontier-lab level
  (two OpenAI products discontinued within a year); revisit only once a
  provider-agnostic abstraction can wrap it without lock-in.
- Autonomous execution of high-risk actions without approval — this is a
  permanent product principle, not a temporary MVP limitation.
