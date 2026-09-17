# Workflows

## Data model

A `WorkflowPlan` (`packages/core/src/types.ts`) has: `trigger`
(`manual` | `schedule` with a cron string), and an ordered list of `steps`.
Each `WorkflowStep` has a `kind`, an optional `tool` name, `input` (may
contain `{{steps.X.output.field}}` template references), and a `riskLevel`.

Step kinds implemented today: `tool`, `notify`, `approval`. Step kinds that
exist in the type system but are **no-ops** in the current engine:
`condition`, `loop`, `delay` — declared so plans can reference them without
a type error, but not executed (see `docs/ROADMAP.md` V2).

## The two supported templates (MVP)

### 1. Website monitor + notify

Trigger: `manual` or a parsed schedule phrase ("every day at 8am", "every
weekday", "every Monday at 9:30am", "every N hours" — `agents/scheduleParser.ts`).

Steps generated (per URL found in the request text):
1. `http_fetch_extract` — read the page.
2. `diff_snapshot` — compare against last run's snapshot for this
   automation (this is the verification step).
3. `summarize_text` — summarize only the changed content (or say "no
   changes detected" if nothing changed — the engine doesn't waste an LLM
   call re-describing unchanged content).
4. `notify` (only if the request said "notify"/"email"/"alert"/etc.) — high
   risk, gated on approval.

### 2. File organize

Trigger: `manual` (no schedule parsing attempted for this template).

Steps generated: one `file_organize` step with a default rule set
(documents/images/spreadsheets/archives by extension) against a folder
name extracted from the request text (defaults to `inbox`). Risk: medium,
gated on approval.

### Fallback: unsupported

If the request contains neither a URL nor an organize+file request, the
planner returns a single `approval`-kind step labeled "Manual review
needed" rather than guessing at an automation. This is intentional — see
`docs/AGENTS.md` on why the planner never fabricates tool calls it isn't
confident about.

## Execution semantics

- Steps run strictly in the order listed.
- A step's **effective risk** is `max(step.riskLevel, tool.riskLevel)` —
  see `docs/ARCHITECTURE.md`.
- A `tool`/`notify` step retries on failure up to 3 attempts (linear
  backoff: 300ms, 600ms), then the whole run is marked `failed` with the
  real error message attached to that step.
- A run that hits an approval gate is **paused**, not failed — status
  `pending_approval` — and resumes exactly where it left off once approved
  (already-succeeded steps are not re-run; see the replay logic in
  `runWorkflow()`).
- A rejected approval **cancels** the run; the gated step (and anything
  after it) never executes.

## Scheduling & idempotency

`scheduler/index.ts` polls every 60 seconds for active, cron-triggered
automations and (re)registers/unregisters `node-cron` jobs accordingly.
Before creating a new scheduled run, it checks for any run already
`queued`/`running`/`pending_approval` for that automation and skips if one
exists — this prevents overlapping executions if a previous run is slow or
stuck waiting on approval.
