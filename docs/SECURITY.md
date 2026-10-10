# Security

Threat model and implementation status. Status values: **Implemented**,
**Partial**, **Not implemented (documented risk)**.

## Authentication & accounts

| Threat | Mitigation | Status |
|---|---|---|
| Plaintext/weak password storage | `scrypt` (Node built-in, N=16384) via `lib/crypto.ts`; minimum 10-char password enforced at the validation layer | Implemented |
| Credential stuffing / brute force login | 5 failed attempts locks the account for 15 minutes; login responses are identical for "wrong password" and "no such account" (no enumeration); login endpoint additionally rate-limited (10/min/IP) | Implemented |
| Stolen/replayed refresh token | Refresh tokens are opaque (not JWTs), stored only as a `sha256` hash, and **rotate on every use** — reusing an already-rotated token is rejected (`sessions.revoked_at`) | Implemented |
| Session fixation after password change | Changing or resetting a password revokes every other session for that account immediately | Implemented |
| Stale access after suspension | `requireAuth` re-reads `users.status` from the DB on *every* request (not cached in the JWT) — a suspended user's still-unexpired access token is rejected on their very next call; suspension also explicitly revokes all their refresh-token sessions | Implemented (verified by `auth.test.ts`'s "suspending a user invalidates their access immediately") |
| Privilege escalation to system owner | Only an existing owner can grant/revoke the `owner` system role or touch their own role via the admin API; a plain `admin` is rejected (403) | Implemented (verified by test) |
| Timing attack revealing valid emails via login | A password hash is computed even when the user doesn't exist (against a decoy hash), so response timing doesn't distinguish "wrong password" from "no such account" | Implemented |

## Authorization & tenancy

| Threat | Mitigation | Status |
|---|---|---|
| Cross-tenant data access | Every business table carries `workspace_id`; every route scopes its queries by `req.auth.workspaceId` from the authenticated session — verified directly by `auth.test.ts`'s "workspace isolation" test (an automation created in workspace A returns 404, not data, to an authenticated user of workspace B) | Implemented |
| Workspace role bypass (e.g. a viewer creating automations) | `requireWorkspaceRole(min)` checks a rank (`viewer < member < admin < owner`) computed fresh from `workspace_members` on every request | Implemented |
| **Router-mount ordering bug**: a role-gating router's unscoped `router.use()` middleware intercepting unrelated requests | Found during test-writing: `adminRouter`'s `requireSystemAdmin` was originally mounted at the same bare `/api` prefix as every other router; Express ran its router-level middleware for *every* `/api/*` request reaching it in the stack (not just `/api/admin/*`), so a non-admin's `GET /api/automations` was rejected with 403 before ever reaching `automationsRouter`. Fixed by mounting `adminRouter` at its own `/api/admin` prefix, so Express only dispatches matching requests into it at all | Fixed; regression-tested (`auth.test.ts` → "requireWorkspaceRole" and "workspace isolation") |
| Last-owner lockout | Removing or demoting the last `owner` of a workspace is rejected | Implemented |
| System admin panel reachable by regular users | `/api/admin/*` requires system role `owner`/`admin`; frontend also soft-gates the `/admin` page (defense in depth, not the real boundary — the API check is) | Implemented |

## Secrets

| Threat | Mitigation | Status |
|---|---|---|
| Workspace AI provider API keys stored in plaintext | AES-256-GCM envelope encryption (`lib/crypto.ts`); the API never returns the decrypted key, only `has_api_key: boolean` | Implemented |
| API key (the platform's own `sk_...` tokens) leakage from a DB dump | Only a `sha256` hash is stored; the full token is shown exactly once, at creation | Implemented |
| `JWT_SECRET`/`ENCRYPTION_KEY` missing in production | Both fail the process at startup (`process.exit(1)`) when `NODE_ENV=production` and unset — no silent insecure fallback in prod; development gets a loud console warning and an auto-generated/fixed dev value instead | Implemented |
| `credentials` table (free-form workspace secrets, distinct from provider configs) | Schema exists for future use; currently unused by any code path — do not wire it up without reusing the same `encryptSecret`/`decryptSecret` helpers | Not implemented (documented) |

## Request-level hardening (unchanged from the MVP pass, still in force)

| Threat | Mitigation | Status |
|---|---|---|
| SSRF via `http_fetch_extract`/`browser_snapshot` | `tools/ssrfGuard.ts`: rejects non-http(s) schemes, loopback hostnames, literal private/link-local IPv4 and IPv6 addresses, **and** resolves DNS to catch a public hostname that resolves to a private IP. (A bracketed IPv6 literal bypass was caught by `ssrfGuard.test.ts` during the original hardening pass and fixed — see git history.) | Implemented |
| Path traversal via `file_organize` | Every path resolved and checked against a single sandboxed `FILE_TOOL_ROOT` | Implemented |
| Irreversible action without human review | Risk classification per step; engine blocks medium/high-risk steps until explicit approval; effective risk = `max(planner label, tool's own declared risk)` | Implemented |
| Malformed/oversized/malicious request bodies | zod schemas on every mutating route | Implemented |
| Missing required tool input fields | Enforced at the engine boundary before any tool runs | Implemented (field presence only — not full value-type validation) |
| Unhandled async errors hanging a request | Every async route wrapped with `asyncHandler()`; centralized error handler never leaks stack traces | Implemented |
| Flooding / brute force | Global + per-endpoint rate limits (`express-rate-limit`) | Implemented — in-memory, per-process (not distributed) |
| Missing security headers | `helmet()` | Implemented |
| Overly permissive CORS | `cors({ origin: CORS_ORIGIN })`, no wildcard default | Implemented |
| SQL injection | `better-sqlite3` prepared statements everywhere | Implemented |
| XSS | React's default escaping; no `dangerouslySetInnerHTML` | Implemented |
| CSRF | Bearer-token auth (not cookies) — classic CSRF doesn't apply to this auth model | Implemented by construction |
| Orphaned browser process on restart | `SIGTERM`/`SIGINT` close the shared Playwright instance and DB handle | Implemented |

## Not yet addressed

- No full JSON-Schema/type-level validation of tool input *values* (only
  required-field presence).
- No distributed rate limiting (single-process in-memory store).
- No 2FA (schema has unused `totp_*` columns reserved for this — not built,
  per the "no fake functionality" rule: an unused column is honest, a UI
  toggle that doesn't actually enforce anything would not be).
- No automated adversarial test for prompt injection via fetched content
  (mitigated architecturally — the planner never re-plans from tool output —
  but not adversarially tested).
- Refresh tokens and API keys are stored in the frontend's `localStorage`,
  which is readable by any script on the page — acceptable for this app's
  threat model (no third-party scripts, strict CORS) but not a substitute
  for httpOnly-cookie sessions if that threat model changes.

## How this was verified, not just asserted

53 automated tests (`npm run test:server`) include real HTTP integration
tests (via `supertest` against the actual Express app, not mocks) for:
registration/login/lockout, refresh-token rotation and replay rejection,
logout, password change revoking other sessions, workspace invite + role
enforcement (a viewer can read but not create), **cross-tenant isolation**
(automation created in one workspace returns 404 to a user of another),
system-admin gating (owner vs. admin vs. member), and suspension taking
effect on the very next request. The router-mount bug above was caught by
exactly this kind of test, not by code review — see `docs/TESTING.md`.
