# Testing

## Automated tests (20 passing, `apps/server`)

Run with `npm run test:server` from the repo root, or `npx vitest run` from
`apps/server`. Each test file gets an isolated in-memory SQLite DB and a
scratch temp directory (`src/__tests__/setup.ts`) — no test touches the
real dev database or the real sandboxed files root.

- `scheduleParser.test.ts` (5) — natural-language recurrence phrases parse
  to the correct cron expression; non-recurrence text returns `null`.
- `planner.test.ts` (4) — website-monitor template (with/without notify,
  affecting `requiresApproval`), file-organize template (correctly labeled
  medium risk), and the unsupported-request fallback.
- `tools.test.ts` (7) — SSRF guard on `http_fetch_extract`; path-traversal
  guard and actual file-move behavior (+ dry-run) on `file_organize`;
  `diff_snapshot`'s changed/unchanged detection and per-automation
  isolation (a tenant-isolation-style test for the `artifacts` table).
- `engine.test.ts` (4) — approval gate pauses before a high-risk step and
  only resumes on explicit approval; a rejected approval cancels the run
  without the gated step ever running; the risk **safety net** (a
  mislabeled low-risk step is still gated because the *tool's own*
  declared risk is medium/high); retry-then-fail behavior with the real
  error surfaced.

## Scenario coverage vs. the brief's Section 28 list

| Scenario | Covered by |
|---|---|
| User creates a simple automation | `planner.test.ts` + manual E2E below |
| Agent generates a multi-step workflow | `planner.test.ts` (website-monitor: 4 steps) |
| Workflow executes successfully | `engine.test.ts` (approval → succeeded) |
| Tool fails and retry occurs | `engine.test.ts` (retries a failing tool) |
| User approval is required | `engine.test.ts` (pending_approval gate) |
| Automation runs on schedule | Manual verification (scheduler; see below) — no automated test yet, tracked in `docs/ROADMAP.md` |
| Unauthorized user accesses another workspace | Partial: `tools.test.ts` proves artifact isolation between automations; full cross-workspace auth isn't implemented yet (`docs/SECURITY.md`) |
| Malicious webpage attempts prompt injection | Addressed architecturally (planner never re-plans from tool output — `docs/AGENTS.md`), not covered by an automated adversarial test yet |
| API provider becomes unavailable | `providers/*.ts` throw on non-2xx; planner's `buildRationale` catches provider failure and falls back to template text — covered by inspection, not a dedicated test with a mocked failing provider yet |
| Workflow produces incorrect output, verification catches it | `tools.test.ts` (`diff_snapshot` correctly reports unchanged vs. changed) |

## Manual end-to-end verification performed this session

1. **API-level**: planned, activated, and ran the website-monitor
   automation against a real reachable domain (`pypi.org` — the sandbox's
   egress proxy blocks arbitrary domains including `example.com`; this is
   a sandbox network-policy artifact, not a product limitation) twice in a
   row — first run correctly reported `changed: true` (no prior baseline),
   second identical run correctly reported `changed: false` and the
   summarizer output "(no changes detected)" instead of re-summarizing.
   Approved the pending `notify` step and confirmed it recorded to
   `/api/notifications`.
2. **API-level**: ran the file-organize automation against real files in a
   sandboxed test directory; confirmed the medium-risk approval gate fires;
   rejected it once (files untouched, run `cancelled`) and approved it once
   (files actually moved into `documents/`/`images/` subfolders).
3. **Full browser UI**: headless-Chromium (Playwright) smoke test
   (`apps/server/scripts/ui-smoke-test.mjs`) drove the actual Next.js
   production build through the whole loop — typed the request, generated
   a plan, activated it, ran it, hit the approval screen, approved it, and
   confirmed the run reached `succeeded` — with screenshots captured at
   each stage.

## What "no fake functionality" means here, concretely

- The local AI provider is labeled in its own source comment as a
  heuristic, not a real model — the UI never claims otherwise.
- `notify` never claims to have delivered an email when SMTP isn't
  configured; it reports exactly what it did (logged locally).
- Every UI button (Generate plan, Review & Activate, Run now, Pause/
  Activate, Approve/Reject) calls a real backend endpoint verified above —
  none is a placeholder.
