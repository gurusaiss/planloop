# Product Requirements Document

## Vision

Let a person describe a repetitive task in plain language, review exactly what
the system plans to do, and have it executed reliably — with verification, not
blind trust in AI output, and with human approval on anything risky.

```
USER: "Here is what I want done."
  -> AI UNDERSTANDS
  -> AI PLANS
  -> USER REVIEWS
  -> AUTOMATION EXECUTES
  -> AI/SYSTEM VERIFIES
  -> RESULT
  -> USER SAVES/REUSES AUTOMATION
```

## Why this, why now (see docs/RESEARCH.md for sourcing)

- Zapier/Make have no AI planning and punish multi-step workflows with
  per-task pricing. **FACT**
- n8n proves local/self-hosted execution is viable and valued, but has no LLM
  planning, no browser agent, no approval-by-default UX. **FACT**
- UiPath's selector-based RPA is brittle by architecture; enterprises are
  actively leaving it. **FACT**
- Manus/Lindy/Relevance AI/Gumloop all share the same top complaint: opaque
  credit-based billing causing unpredictable costs. **FACT**
- Across the field, fewer than half of agent tools document a human-approval
  step before irreversible actions — and the incidents that follow (a support
  bot auto-closing 40 tickets wrong in a day; an IDE agent inventing a policy
  that caused mass cancellations) are a direct consequence. **FACT**

**RECOMMENDATION** (adopted): differentiate on trust, not raw capability —
approval-by-default, visible verification, provider independence, and a real
local-execution mode — rather than trying to out-autonomous the incumbents.

## Target users (initial wedge)

Prosumer / solo operator / small-team ops — freelancers, indie founders,
small-business owners, students, and technical individuals who currently
stitch together Zapier + ChatGPT + manual copy-paste, and for whom UiPath and
Copilot Studio are both too expensive and too enterprise. **INTERPRETATION**

Personas:
- **Freelancer/founder** — wants competitor/price monitoring, lead research,
  recurring reports, without paying per-task fees.
- **Student/researcher** — wants recurring research summaries, file/document
  organization.
- **Small-business operator** — wants file/document processing, scheduled
  reports, notification workflows, without RPA-level cost or complexity.

## Problems this MVP addresses (from docs/RESEARCH.md §2)

Selected for boundedness, moderate technical difficulty, and low/medium
privacy risk:
1. Website/competitor monitoring & change alerting (#12 in RESEARCH.md).
2. File organization (#6, restricted to a sandboxed local directory).

Explicitly deferred (see RESEARCH.md for why): inbox triage/auto-reply,
legacy enterprise UI automation, personal-finance/credential-heavy tasks,
legal/compliance document review — all either need a mature verification
layer we haven't earned yet, or carry privacy/liability risk too high for an
MVP.

## Core loop (implemented)

1. **Describe** — free-text input ("Every day at 8am check <url> and notify
   me if anything changed").
2. **Plan** — deterministic template-matching planner extracts trigger,
   steps, and per-step risk; an LLM (if configured) only writes the
   human-facing rationale text (see `docs/AGENTS.md` for why this split).
3. **Review** — the exact steps and risk levels are shown before anything is
   persisted or executed.
4. **Activate** — persists the plan as an `automation`.
5. **Execute** — manual "Run now" or a cron schedule triggers a `run`.
6. **Approval gate** — any medium/high-risk step pauses the run and creates
   an `approval` request; nothing risky executes unattended.
7. **Verify** — `diff_snapshot` deterministically checks whether monitored
   content actually changed, rather than re-summarizing everything every run.
8. **Result** — step-by-step execution log, final status, and (for
   website-monitor) a notification record.

## Non-functional requirements

- **No fake functionality**: every button in the UI calls a real endpoint
  that does real work; there is no scripted/staged demo path.
- **Zero mandatory paid dependency**: the platform runs fully offline/free
  with the local heuristic planner/summarizer and SQLite; see `docs/COSTS.md`.
- **Provider independence**: LLM calls go through one `LlmProvider`
  interface; OpenAI/Anthropic/Gemini/local are adapters, not the core.
- **Human-in-the-loop by default**: risk level is enforced by the engine
  (max of planner-assigned and tool-declared risk), not just by the planner.

## Success metrics (MVP-appropriate, not vanity)

- % of created plans that get activated without edits (plan quality proxy).
- % of runs that reach `succeeded` on first attempt (reliability proxy).
- Time from "describe task" to "first successful run" (activation speed).
- Count of approvals rejected (signals whether risk labeling is trusted or
  ignored/rubber-stamped).

## Out of scope for MVP (see docs/ROADMAP.md)

Multi-tenant orgs/RLS, billing, multi-agent specialization beyond the single
planner, OAuth/credential vault, mobile/desktop/browser-extension clients,
computer-use/vision agents, WhatsApp/email-triggered tasks.
