# Agents

## Only one agent exists in the MVP: the Planner Agent

`apps/server/src/agents/planner.ts`. It turns free-text input into a
`WorkflowPlan`.

**Deliberate design decision**: step construction (which tools run, in what
order, with what inputs, at what risk level) is **deterministic and
rule-based**, not "ask the LLM to emit workflow JSON and hope it validates."

Why: an LLM hallucinating a tool name, or emitting a subtly malformed input
object, would silently break a real automation — possibly one running
unattended on a schedule. That failure mode is unacceptable for a product
whose core differentiator (per `docs/PRODUCT.md`) is trust and reliability.
So:

- URL extraction, schedule-phrase parsing (`agents/scheduleParser.ts`), and
  keyword matching (`organize` + `file`, `notify`/`email`/`alert`) decide
  *what* the plan contains.
- The LLM (only when a real provider — OpenAI/Anthropic/Gemini — is
  configured; the default local provider skips this entirely) is used
  *only* to write the human-facing rationale sentence explaining the plan.
  It never influences which tools run or with what inputs.

This is a hybrid, not "no AI" — the rationale text genuinely comes from an
LLM when one is configured — but the reliability-critical path has zero
LLM dependency.

## Why not more agents

Section 4E of the brief lists candidate specialized agents (Research,
Browser, Data Extraction, File, Email, Coding, Document, Verification,
Scheduler, Notification). The MVP deliberately does **not** create separate
agent objects for these — they exist as **tools** (see `docs/TOOLS.md`)
called by the single planner + a stateless workflow engine, because:

- A "Verification Agent" would just be another LLM call judging its own
  prior output — `diff_snapshot`'s deterministic byte-comparison is more
  trustworthy than that, for the one workflow that currently needs
  verification.
- A "Scheduler Agent" is just cron polling — no reasoning is involved
  (`scheduler/index.ts`).
- A "Notification Agent" is a side effect, not a decision.

**RECOMMENDATION**: add a genuinely separate agent only when a task
requires its own multi-step reasoning loop that the planner+tools model
can't express — e.g. a future Research Agent that must decide *which*
sources to consult and *when* it has gathered enough, not just execute a
fixed tool sequence. Until then, more "agents" would be a marketing choice,
not an architectural one (this is explicitly what the brief's Section 49
warns against).

## Memory (Section 30 of the brief)

| Level | What | Why | How long | Where | Who can access |
|---|---|---|---|---|---|
| Short-term (per-run) | Step outputs (`outputs` map in `engine.ts`) | Template interpolation between steps in the same run | Life of the run's execution (in-process `Map`), then persisted as `run_steps.output_json` | In-memory during execution; SQLite after | Same workspace only (schema-enforced today; not query-enforced until multi-tenant auth lands) |
| Workflow memory | Last content snapshot per (automation, monitored key) | `diff_snapshot`'s verification step | Indefinitely, one row per key, overwritten each run | `artifacts` table | Same workspace |
| User preferences | None persisted yet beyond the plan itself | N/A | N/A | N/A | N/A |
| Long-term | None | Explicitly avoided for MVP — no cross-run "learning" or profile-building, to keep the data-retention story simple and honest | N/A | N/A | N/A |

Nothing is stored "just in case." Each stored value maps to a specific,
currently-used feature (interpolation, or change detection).
