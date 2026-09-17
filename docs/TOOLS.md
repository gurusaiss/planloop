# Tools

Every tool implements `ToolDefinition` (`packages/core/src/types.ts`):
`name`, `description`, `riskLevel`, `inputSchema` (declarative), and an
async `run(input, ctx)`. New tools are added by writing one file and
registering it in `apps/server/src/tools/index.ts` — nothing else changes.

| Tool | File | Risk | What it actually does | Real limits/guards |
|---|---|---|---|---|
| `http_fetch_extract` | `tools/httpFetch.ts` | low | Plain HTTP GET + cheerio text extraction from a public page | Rejects non-http(s) and loopback/internal hostnames; caps extracted text at 20,000 chars |
| `browser_snapshot` | `tools/browserSnapshot.ts` | low | Loads a page in real headless Chromium (Playwright) and reads rendered text — for JS-heavy pages a plain fetch can't read | Same URL guards; reuses one browser instance across calls; runs fully locally, no external API |
| `diff_snapshot` | `tools/diffSnapshot.ts` | low | Compares new content against the last stored snapshot for this automation+key; this *is* the verification step for monitoring workflows | Snapshots are keyed by `automation_id` — one automation can never see another's snapshot (tested in `tools.test.ts`) |
| `summarize_text` | `tools/summarize.ts` | low | Summarizes text via the configured `LlmProvider` | With the default local provider, this is an honest extractive heuristic (scores sentences by distinctive-word density), not a real LLM — labeled as such in code comments, never presented as more than it is |
| `file_organize` | `tools/fileOrganize.ts` | **medium** | Moves files within a sandboxed root directory into rule-matched subfolders by extension | Every path is resolved and checked against `FILE_TOOL_ROOT`; anything outside it is refused, tested in `tools.test.ts`; supports `dryRun` |
| `notify` | `tools/notify.ts` | **high** | Records a notification (subject/body) | If SMTP env vars aren't set (the zero-cost default), it writes to the local `notifications` table and says so honestly — it does **not** pretend to have sent an email it didn't send |

## Why `notify` is high-risk and `file_organize` is medium-risk

- `notify` is externally visible (or will be, once real email sending is
  wired up) and cannot be un-sent — matches the brief's "sending messages"
  high-risk category exactly.
- `file_organize` changes state on disk (moves files) but is reversible and
  fully sandboxed — matches "modify files" medium-risk category.
- Both are enforced by the **engine**, not just declared here — see the
  `maxRisk` safety net in `docs/ARCHITECTURE.md`.

## Deliberately not built for MVP

- Email sending (SMTP), calendar, database, spreadsheet, code-execution,
  image-processing tools — none of the shipped planner templates need them
  yet; adding an unused tool would be exactly the "feature because it sounds
  impressive" anti-pattern the brief warns against (Section 49).
