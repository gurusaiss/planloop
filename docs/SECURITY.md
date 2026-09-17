# Security

Threat model and implementation status for the current MVP. Status values:
**Implemented**, **Partial**, **Not implemented (documented risk)**.

| Threat | Risk | Mitigation | Status |
|---|---|---|---|
| SSRF via `http_fetch_extract`/`browser_snapshot` (agent fetches internal/loopback addresses) | Medium | Reject `localhost`/`127.0.0.1`/`0.0.0.0`/`::1` hostnames and non-http(s) schemes before fetching | Implemented (`tools/httpFetch.ts`). Does not resolve DNS to block private IP ranges behind a public hostname — see below | Partial |
| Path traversal / arbitrary filesystem access via `file_organize` | High | Resolve every path with `path.resolve` and reject anything outside a single sandboxed `FILE_TOOL_ROOT` directory | Implemented (`tools/fileOrganize.ts`), covered by `tools.test.ts` | Implemented |
| Agent performs an irreversible action (send/delete/purchase) without human review | High | Risk classification per step; engine blocks medium/high-risk steps until an explicit `approved` decision exists; effective risk is `max(planner label, tool's own declared risk)` so a planner mislabel can't bypass this | Implemented (`workflows/engine.ts`, covered by `engine.test.ts`) | Implemented |
| Prompt injection via fetched web content (page tells the "AI" to ignore instructions / exfiltrate data) | Medium-High | The fetched text is only ever passed to the summarizer with a fixed system instruction; the summarizer's output is never treated as a new instruction, never used to select tools or construct further tool inputs | Implemented by construction (planner does not re-plan based on tool output) | Partial — no explicit content-scanning/sanitization layer yet |
| Malicious/compromised webpage content included verbatim in a notification | Low-Medium | Notifications are logged internally (see `docs/COSTS.md` — no real email sending is wired up in MVP), so there's no automatic external send of untrusted content today | Implemented (no-op by absence) | Partial |
| Credential/API key leakage | High | All provider keys read from `process.env` only; never returned by any API response; never rendered in frontend code; `.env` is gitignored | Implemented | Implemented |
| Secrets stored in plaintext | High | `credentials` table exists in schema for future use but is currently unused by any code path; no plaintext secret is written anywhere by the MVP | N/A (not yet wired up) | Not implemented — flagged; do not use the `credentials` table until it's wired to real encryption |
| SQL injection | High | `better-sqlite3` prepared statements with bound parameters everywhere; no string-concatenated SQL exists in the codebase | Implemented | Implemented |
| XSS in the frontend | Medium | React's default escaping for all rendered content (tool outputs, plan text) is never `dangerouslySetInnerHTML`'d | Implemented | Implemented |
| CSRF | Low (no session/cookie auth yet) | N/A until authentication exists — tracked as a prerequisite of adding auth, not a standalone gap today | Deferred with auth |
| Broken authentication / no authentication | High | None — MVP has no auth layer; anyone reaching the API can create/run automations | Not implemented (documented) — MVP is intended for local-only single-user use |
| Multi-tenant isolation failure | High (once multi-tenant) | Every table carries `workspace_id`; MVP only ever uses one workspace (`ws_default`), so cross-tenant leakage cannot currently occur, but no query-level enforcement (e.g. RLS) exists yet for when a second workspace is added | Deferred — see `docs/ROADMAP.md` |
| Malicious workflow definition (hand-crafted plan JSON with a bad tool name or oversized input) | Medium | Engine looks up tools by name in a fixed registry (`Unknown tool` errors instead of executing arbitrary code); tool input schemas exist for documentation but are not yet enforced with runtime validation | Partial — schema is declarative only, not enforced with e.g. zod at the engine boundary yet |
| Denial of service via unbounded fetch/summarize input | Low-Medium | Fetched text is capped at 20,000 characters before being returned/summarized | Implemented (`tools/httpFetch.ts`, `tools/browserSnapshot.ts`) | Implemented |
| Duplicate/overlapping scheduled runs | Medium | Scheduler checks for an in-flight run (`queued`/`running`/`pending_approval`) for the same automation before creating a new one | Implemented (`scheduler/index.ts`) | Implemented |

## Not yet addressed (explicitly, so it isn't silently assumed done)

- No authentication/authorization layer at all.
- No runtime input-schema validation at the tool boundary (declared but not
  enforced).
- No DNS-resolution-based SSRF protection (a public hostname that resolves
  to a private IP would currently pass the guard).
- No rate limiting on any endpoint.
- No encryption for the (currently unused) `credentials` table.

None of these block local single-user MVP use; all of them block any
shared/multi-user deployment and must be addressed before that.
