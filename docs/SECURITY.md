# Security

Threat model and implementation status. Status values: **Implemented**,
**Partial**, **Not implemented (documented risk)**.

| Threat | Risk | Mitigation | Status |
|---|---|---|---|
| SSRF via `http_fetch_extract`/`browser_snapshot` (agent fetches internal/loopback addresses, or a hostname that resolves to one) | Medium | `tools/ssrfGuard.ts`: rejects non-http(s) schemes and obvious loopback hostnames, checks literal IPv6 addresses directly, **then resolves DNS and rejects any A/AAAA record in a private/loopback/link-local range** (10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, `::1`, `fc00::/7`, `fe80::/10`) — closes the "public hostname, private IP" gap a hostname-only check misses | Implemented — and caught its own regression in review: `URL.hostname` keeps brackets around a literal IPv6 address (`"[::1]"`), which matched neither the bare `"::1"` blocklist entry nor `dns.lookup()`, letting a bracketed loopback/private IPv6 literal through; `ssrfGuard.test.ts` (`rejects a literal loopback IPv6 address`) caught it, fixed by stripping brackets before every check |
| Path traversal / arbitrary filesystem access via `file_organize` | High | Resolve every path with `path.resolve` and reject anything outside a single sandboxed `FILE_TOOL_ROOT` directory | Implemented (`tools/fileOrganize.ts`), covered by `tools.test.ts` |
| Agent performs an irreversible action (send/delete/purchase) without human review | High | Risk classification per step; engine blocks medium/high-risk steps until an explicit `approved` decision exists; effective risk is `max(planner label, tool's own declared risk)` so a planner mislabel can't bypass this | Implemented (`workflows/engine.ts`, covered by `engine.test.ts`) |
| Broken authentication / no authentication | High | Single-user bearer-token auth (`middleware/auth.ts`) required on every `/api/*` route except `/api/health`; constant-time comparison (`timingSafeEqual`) to avoid timing attacks on the token; token from `ADMIN_TOKEN` env or a random one generated (and logged, never persisted) at startup | Implemented — still single-user, not multi-account; see `docs/ROADMAP.md` for real multi-user auth |
| Malicious/oversized/malformed request body (plan JSON, approval decision, plan text) | Medium | zod schemas (`validation/schemas.ts`) validate every request body before it reaches the planner/DB — bounded string lengths, enum-checked risk levels/step kinds/decisions, capped step count (50) | Implemented |
| Malicious workflow definition (hand-crafted plan with a bad tool name or missing required fields) | Medium | Engine looks up tools by name in a fixed registry (`Unknown tool` errors instead of executing arbitrary code); **every tool's declared `inputSchema.required` fields are checked before the tool runs** (`assertRequiredFields` in `workflows/engine.ts`) | Implemented for required-field presence; still no full JSON-Schema/type validation of field values — Partial |
| Unhandled async errors crashing or hanging a request | Medium | Every async route handler is wrapped with `asyncHandler()`; a centralized Express error handler returns a generic 500 and logs server-side, never leaking a stack trace to the client | Implemented |
| Denial of service via request flooding | Medium | `express-rate-limit`: 120 req/min global per IP, 20 req/min on `/api/plan` specifically (the most expensive endpoint) | Implemented — in-memory store, resets on restart, not distributed across multiple server instances (fine for MVP's single process) |
| Missing security headers (clickjacking, MIME sniffing, etc.) | Low-Medium | `helmet()` applied globally with its default policy | Implemented |
| Overly permissive CORS | Medium | `cors({ origin: CORS_ORIGIN })` — no wildcard default; must be set to the actual frontend origin | Implemented |
| Prompt injection via fetched web content (page tells the "AI" to ignore instructions / exfiltrate data) | Medium-High | The fetched text is only ever passed to the summarizer with a fixed system instruction; the summarizer's output is never treated as a new instruction, never used to select tools or construct further tool inputs | Implemented by construction (planner does not re-plan based on tool output) — Partial: no explicit content-scanning/sanitization layer yet |
| Malicious/compromised webpage content included verbatim in a notification | Low-Medium | Notifications are logged internally (no real email sending is wired up — see `docs/COSTS.md`), so there's no automatic external send of untrusted content today | Partial (mitigated by absence of a real send path, not by content filtering) |
| Credential/API key leakage | High | All provider keys and `ADMIN_TOKEN` read from `process.env` only; never returned by any API response; never rendered in frontend code; `.env` is gitignored | Implemented |
| Secrets stored in plaintext | High | `credentials` table exists in the schema for future use but is currently unused by any code path; no plaintext secret is written anywhere by the MVP | Not implemented — flagged; do not use the `credentials` table until it's wired to real encryption |
| SQL injection | High | `better-sqlite3` prepared statements with bound parameters everywhere; no string-concatenated SQL exists in the codebase | Implemented |
| XSS in the frontend | Medium | React's default escaping for all rendered content (tool outputs, plan text) is never `dangerouslySetInnerHTML`'d | Implemented |
| CSRF | Low | Bearer-token auth (not cookies) — CSRF requires an ambient credential (cookie) the browser sends automatically; a bearer token in an `Authorization` header isn't sent that way, so classic CSRF doesn't apply to this auth model | Implemented by construction |
| Race condition: an approval resolved twice (double-click / replayed request) | Low | `/api/runs/:id/approvals/:approvalId` now checks the approval is still `pending` before resolving it, returning 409 otherwise | Implemented |
| Multi-tenant isolation failure | High (once multi-tenant) | Every table carries `workspace_id`; MVP only ever uses one workspace (`ws_default`), so cross-tenant leakage cannot currently occur, but no query-level enforcement (e.g. RLS) exists yet for when a second workspace is added | Deferred — see `docs/ROADMAP.md` |
| Denial of service via unbounded fetch/summarize input | Low-Medium | Fetched text is capped at 20,000 characters before being returned/summarized | Implemented |
| Duplicate/overlapping scheduled runs | Medium | Scheduler checks for an in-flight run (`queued`/`running`/`pending_approval`) for the same automation before creating a new one | Implemented |
| Orphaned browser process on redeploy/restart | Low | `SIGTERM`/`SIGINT` handlers close the shared Playwright browser instance and the SQLite handle before exiting | Implemented |
| Known dependency CVEs | Varies | `uuid` (our own direct dependency, the one MVP code actually called) removed entirely in favor of Node's built-in `crypto.randomUUID()`. Remaining `npm audit` findings: (1) a `uuid` CVE inside `node-cron`'s own transitive dependency — the vulnerable code path requires passing a `buf` argument, which node-cron's internal usage never does, so it does not apply to this app; (2) several Next.js advisories concerning Server Actions, the Image Optimization API, custom servers, and i18n middleware — this app uses none of those (static-ish App Router pages calling `fetch` against our own API, no `next/image`, no middleware, no custom server) | Reviewed and judged not applicable to this codebase's actual usage; re-evaluate before upgrading Next.js for unrelated reasons |

## Not yet addressed (explicitly, so it isn't silently assumed done)

- Single-user auth only — no per-user accounts, no RBAC, no session
  revocation beyond restarting the process with a new `ADMIN_TOKEN`.
- No full JSON-Schema/type-level validation of tool input *values* (only
  required-field presence is enforced).
- No distributed rate limiting (an in-memory store per process).
- No encryption for the (currently unused) `credentials` table.
- No query-level multi-tenant isolation (moot today — only one workspace
  exists).
- No automated adversarial test for prompt injection via fetched content.

None of these block local single-user MVP use; the auth/rate-limiting/CORS
work above specifically was to make "exposed on a real network" safe to do
without also standing up full multi-tenancy — see `docs/MANUAL_STEPS.md`
for what you must configure before actually deploying it that way.
