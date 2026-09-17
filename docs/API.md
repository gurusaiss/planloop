# API

Base URL: `http://localhost:4000` (dev). All bodies are JSON.

## Authentication

Every route below except `/api/health` requires
`Authorization: Bearer <ADMIN_TOKEN>`. Missing or wrong token → `401`. See
`docs/SECURITY.md` and `MANUAL_STEPS.md` for how the token is set.

Rate limits: 120 req/min per IP globally, 20 req/min on `/api/plan`
specifically. Exceeding either returns `429`.

## Health

`GET /api/health` → `{ ok: true, provider: string }` (unauthenticated —
used by load balancers/uptime checks before any credential exists)

## Planning (nothing persisted)

`POST /api/plan`
```json
{ "text": "Every day at 8am check https://example.com and notify me if anything changed" }
```
→ `{ "plan": WorkflowPlan, "rationale": string }`

## Automations

`POST /api/automations` — body `{ "plan": WorkflowPlan }` (the plan
returned by `/api/plan`) → persists it, status `active`.

`GET /api/automations` — list all, most recent first.

`GET /api/automations/:id` — one automation, `plan` field is the parsed
`WorkflowPlan`.

`POST /api/automations/:id/pause` / `POST /api/automations/:id/activate` —
toggles whether the scheduler will fire it (and whether "Run now" is the
only way to trigger it).

`POST /api/automations/:id/run` — manually starts a run. Returns
`{ "runId": string }` immediately (202) — the run executes asynchronously;
poll `GET /api/runs/:id` for progress.

## Runs

`GET /api/runs` — most recent 100, most recent first.

`GET /api/runs/:id` → `{ run, steps: RunStepLog[], approvals: Approval[] }`.

`POST /api/runs/:id/approvals/:approvalId` — body
`{ "decision": "approved" | "rejected" }`. `approved` resumes execution
from the paused step; `rejected` cancels the run permanently.

## Notifications

`GET /api/notifications` — the last 50 recorded notifications (see
`docs/TOOLS.md` on why this is a local log, not a real inbox, in the MVP).

## Error shape

Non-2xx responses are `{ "error": string }` (validation failures also
include a `details: string[]` array from the zod schema). The workflow
engine's own failures surface inside `run.result_json`
(`{ failedStep, error }`) and on the specific `run_steps` row (`error`
column) — never silently dropped.
