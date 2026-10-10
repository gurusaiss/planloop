# Automation Platform

Describe a repetitive task in plain language. Review the exact plan before
anything runs. Activate it. It executes, pauses for your approval on
anything risky, verifies its own result, and gives you a real execution log.

```
"Every day at 8am check https://example.com and notify me if anything changed"
  -> AI plans: fetch -> diff against last run -> summarize changes -> notify (needs your approval)
  -> you review & activate
  -> it runs on schedule, pauses before the risky "notify" step
  -> you approve
  -> done, with a full log of what actually happened
```

Built and verified fully **locally**, at **$0 cost** — see `docs/COSTS.md`.
Nothing in this repository has been pushed to any remote; see the final
report for `git status` and confirmation of that.

## Quick start

```bash
npm install
npm run dev:server   # http://localhost:4000
npm run dev:web       # http://localhost:3000 (separate terminal)
```

Open `http://localhost:3000` and create an account — a personal workspace
is created for you automatically. The first account ever created on a
fresh install becomes the instance owner, with access to the admin panel.
See `docs/SETUP.md` for details, `docs/API.md` for the HTTP API, and
`MANUAL_STEPS.md` for what you need to do before deploying it anywhere.

## What's actually implemented

- Real accounts: email/password with hashed storage, JWT + rotating
  refresh-token sessions, lockout after repeated failed logins, password
  reset, workspace invites by email — see `docs/SECURITY.md`.
- Multi-tenant workspaces: each with its own members/roles
  (owner/admin/member/viewer), API keys, and AI provider configuration —
  switch between workspaces you belong to from the nav bar.
- Instance admin panel: every user and workspace, suspend/activate/promote
  users, a real audit log, and usage stats — gated by system role, not
  workspace role.
- Natural-language → plan (two supported templates: website monitoring
  with change detection, and file organization) — see `docs/WORKFLOWS.md`.
- Risk-classified steps with an approval gate the engine enforces
  independently of the planner (defense in depth) — see `docs/ARCHITECTURE.md`.
- Real tools: HTTP fetch + extraction, real headless-browser snapshotting
  (Playwright), deterministic change detection, text summarization,
  sandboxed file organization, notifications (real email via SMTP if
  configured, otherwise an honest in-app log) — see `docs/TOOLS.md`.
- Provider-agnostic AI layer, configurable per-workspace: works with zero
  API keys (local heuristic provider) or with OpenAI/Anthropic/Gemini,
  either as an instance-wide default or per-workspace override — see
  `docs/AGENTS.md`.
- Cron-based scheduling with overlap prevention, retries with backoff,
  and a full execution log per run.
- 53 automated tests (including real HTTP integration tests of the entire
  auth/tenancy system) + a real headless-browser UI smoke test covering
  every page — see `docs/TESTING.md`.

## Documentation map

| Doc | Contents |
|---|---|
| `docs/RESEARCH.md` | Market/competitor research, problem inventory |
| `docs/PRD.md` | Product requirements, target users, MVP scope |
| `docs/PRODUCT.md` | Differentiation, segments, business model |
| `docs/ARCHITECTURE.md` | System design, execution lifecycle, tradeoffs |
| `docs/SECURITY.md` | Threat model and implementation status |
| `docs/COSTS.md` | What's free, what's optional, what happens at limits |
| `docs/AGENTS.md` | The planner agent, why it's rule-based not free-form LLM |
| `docs/TOOLS.md` | Every tool, its risk level, its real guards |
| `docs/WORKFLOWS.md` | Plan/step data model, the two supported templates |
| `docs/API.md` | HTTP endpoints |
| `docs/TESTING.md` | What's tested, how, and what's manually verified |
| `docs/SETUP.md` | How to run it |
| `docs/ROADMAP.md` | MVP → V1 → V2 → long-term |
| `MANUAL_STEPS.md` | Everything only you can do: secrets, hosting choice, domain, the GitHub push |

## Repository layout

```
apps/server   Express + TypeScript API: planner, workflow engine, tools, scheduler, SQLite
apps/web      Next.js frontend: describe -> plan -> approve -> run -> logs
packages/core Shared types: LlmProvider, ToolDefinition, WorkflowPlan, etc.
docs/         Everything above
```
