# Product & Commercialization

## Differentiation (not "AI agents are the future")

Per `docs/RESEARCH.md`, the market gap is trust, not capability:

1. **Human-approval-by-default** — most competitors bury or skip this;
   here it's structural (the engine enforces it, not just the planner).
2. **Verification as a visible step** — `diff_snapshot` deterministically
   checks whether something actually changed, rather than re-summarizing
   and hoping the LLM judged correctly.
3. **Provider independence** — one `LlmProvider` interface; no lock-in to
   a single lab's agent API, which the OpenAI Operator → ChatGPT agent
   churn shows is a real risk.
4. **Genuine local execution** — runs fully offline with $0 and no account,
   unlike every AI-agent SaaS surveyed except n8n (which lacks AI planning).

## Who has this problem, and would switch

| Segment | Problem frequency | Currently pays for | Why they'd switch | What they'd pay for |
|---|---|---|---|---|
| Freelancer/solo founder | Daily/weekly (monitoring, reports) | Nothing, or a Zapier free/starter plan | Per-task pricing punishes multi-step workflows; no AI planning | A flat or execution-based plan with AI-generated workflows, not per-integration setup time |
| Small business ops | Daily (file/document handling, reports) | Manual labor, maybe a bookkeeping/OCR tool | UiPath-class RPA is priced for enterprise; Zapier can't do "read this and decide" | Predictable pricing + confidence that risky steps won't run unattended |
| Student/researcher | Weekly (monitoring, research digests) | Nothing (manual browsing) | No existing tool does "watch and tell me what changed" well at zero cost | Likely a free tier user, not a paying one — but a growth/awareness channel |
| Technical/developer | As-needed | n8n self-hosted, or custom scripts | Wants AI planning n8n doesn't have, without giving up self-hosting | Self-hosted/OSS core + paid hosted convenience tier |

**INTERPRETATION**: the strongest initial paying segment is small
business/solo-operator B2C-ish self-serve, not enterprise — enterprise
requires governance maturity (audit trails, SSO, compliance) this MVP
doesn't have, and the developer/self-host segment is better served free
(open core) to build trust and distribution first.

## Business model (recommendation, not implemented)

- **Free tier**: local execution, local heuristic provider, limited
  scheduled automations — genuinely usable at $0, not a crippled trial.
  This directly counters the "opaque credit billing" complaint pattern
  found against every AI-agent SaaS competitor.
- **Pro tier**: hosted execution (no local machine needed), higher
  automation/run limits, real LLM provider included (no BYO key needed),
  transparent per-execution pricing (not opaque credits).
- **Team/Business**: multi-tenant workspaces, shared credential vault,
  audit log, once V2's multi-tenancy work lands.
- **Self-hosted**: the open-source core stays runnable exactly as built
  here — this is the credibility anchor against "your data lives in our
  cloud" objections.

No billing is implemented in this MVP (per the brief's own instruction not
to build billing prematurely). The usage-tracking abstraction in
`docs/ROADMAP.md`'s V1 section is the prerequisite groundwork.
