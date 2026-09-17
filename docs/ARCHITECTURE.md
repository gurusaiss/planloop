# Architecture

## System diagram (as implemented)

```
USER (browser)
  |
  v
Next.js web app (apps/web)  --fetch-->  Express API (apps/server)
                                              |
                                              v
                                    ┌─────────────────────┐
                                    │   Planner Agent      │  agents/planner.ts
                                    │ (deterministic rules │
                                    │  + optional LLM text)│
                                    └─────────┬───────────┘
                                              v
                                    ┌─────────────────────┐
                                    │  Workflow Engine     │  workflows/engine.ts
                                    │  step loop + retries │
                                    │  + approval gate      │
                                    └───┬─────────┬────────┘
                                        v         v
                              ┌────────────┐ ┌───────────────┐
                              │ Tool        │ │  Scheduler     │  scheduler/index.ts
                              │ Registry    │ │  (node-cron,   │
                              │ tools/*.ts  │ │  poll every 60s│
                              └─────┬───────┘ └───────────────┘
                                    v
                        SQLite (better-sqlite3) — apps/server/data/app.db
```

There is one LLM-facing seam (`LlmProvider`) and one tool-facing seam
(`ToolDefinition`) — see `packages/core/src/types.ts`. Everything else is
built against those two interfaces.

## Why these choices

- **TypeScript end-to-end (Node + Next.js)**, not a Python backend: the tool
  layer needs Playwright for real browser automation, and Playwright's most
  mature, best-documented API is its native TS/Node one. Keeping the whole
  stack in one language also means the shared `packages/core` types are
  actually shared, not re-declared in two languages. **RECOMMENDATION**,
  adopted.
- **SQLite (better-sqlite3) for MVP**, not Postgres/Supabase: zero external
  account, zero network dependency, zero setup — `npm install` and it works.
  The schema (`db/schema.sql`) already carries `workspace_id` on every
  table specifically so a later swap to Postgres + real multi-tenant RLS is
  a storage-layer change, not a schema redesign. See `docs/COSTS.md`.
- **Deterministic, template-based planner** instead of "ask an LLM to emit
  the workflow JSON": see `docs/AGENTS.md` for the full rationale. Short
  version: a hallucinated tool name or malformed input would silently break
  a real automation, and this is a reliability-first product.
- **Playwright over browser-use/computer-use APIs** for the one browser tool
  in the registry: it's the most mature, best-maintained browser automation
  library, runs fully locally/headless with no external API key, and the
  sandbox environment ships a pre-built Chromium for it. `browser-use`-style
  LLM-driven click-by-click control was considered but rejected for MVP: it
  trades determinism for generality we don't need yet (our monitored-page
  tool just needs rendered text, not autonomous navigation).
- **node-cron with a 60-second poll loop**, not a distributed job queue: at
  MVP scale (one process, one workspace) a distributed scheduler is
  premature complexity. The poll loop means activating/pausing an automation
  takes effect within a minute without a server restart.

## Execution lifecycle

1. `POST /api/plan` — planner returns a `WorkflowPlan`, nothing persisted.
2. `POST /api/automations` — persists the plan; if it has a cron trigger,
   the scheduler picks it up on its next poll.
3. A run starts (`POST /api/automations/:id/run`, or the scheduler) and
   `runWorkflow()` executes steps in order:
   - `tool`/`notify` steps call the matching `ToolDefinition.run()`,
     resolving `{{steps.X.output.field}}` template references against prior
     step outputs.
   - Failures retry up to 3 attempts with linear backoff, then the run is
     marked `failed` with the real error message (never silently swallowed).
   - Before any step whose **effective risk** (`max(step.riskLevel,
     tool.riskLevel)`) is medium/high, the engine creates an `approval` row
     and returns — pausing the run — the API server process does not block
     on this.
4. `POST /api/runs/:id/approvals/:approvalId` with `{decision}` either
   cancels the run (`rejected`) or calls `runWorkflow()` again, which skips
   already-succeeded steps (replayed from `run_steps`) and resumes.
5. Verification is deliberately not a separate bolt-on stage — for the
   website-monitor template, `diff_snapshot` *is* the verification step: it
   deterministically decides "did anything actually change" instead of
   trusting the LLM summary to have judged that correctly.

## Security boundaries (see docs/SECURITY.md for the full threat model)

- `http_fetch_extract`/`browser_snapshot` refuse loopback/internal
  hostnames (basic SSRF guard) and non-http(s) schemes.
- `file_organize` resolves every path and refuses anything that resolves
  outside a single sandboxed root directory (`FILE_TOOL_ROOT`).
- Medium/high-risk steps cannot execute without an explicit `approved`
  decision recorded in the `approvals` table — enforced by the engine, not
  just by planner-assigned labels (see the `maxRisk` safety net in
  `workflows/engine.ts`, added after a real test caught the gap — see
  `engine.test.ts`).
- API keys/credentials are read from `process.env` only; nothing is
  persisted in plaintext in the database, and nothing is sent to the
  frontend.

## Extensibility seams (Section 34 of the brief)

| New... | ...plugs in via | Where |
|---|---|---|
| Tool | one `ToolDefinition` object | `tools/*.ts`, registered in `tools/index.ts` |
| LLM provider | one `LlmProvider` object | `providers/*.ts`, registered in `providers/index.ts` |
| Workflow step kind | a case in the engine's step switch | `workflows/engine.ts` |
| Planner template | a branch in `detectTemplate`-equivalent logic | `agents/planner.ts` |

## Known architectural limitations (honest, not hidden)

- Single default workspace (`ws_default`); the schema supports
  multi-tenancy, the API/auth layer does not enforce it yet — see
  `docs/ROADMAP.md`.
- No authentication — anyone who can reach the API can create/run
  automations. Fine for local-only MVP use, not for any shared deployment.
- The workflow engine executes steps strictly in sequence; `condition`,
  `loop`, and `delay` step kinds exist in the type system but are no-ops in
  the MVP engine (see `docs/WORKFLOWS.md`).
- The planner supports exactly two templates (website-monitor,
  file-organize); anything else returns an honest "manual review needed"
  plan rather than guessing.
