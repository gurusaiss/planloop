# API

Base URL: `http://localhost:4000` (dev). All bodies are JSON.

## Authentication

Two supported credential types, both sent as `Authorization: Bearer <token>`:
- **JWT access token** (from login/register/refresh) — short-lived (15 min).
  The active workspace is resolved per-request from the `X-Workspace-Id`
  header (falling back to your oldest membership if omitted), **not** baked
  into the token — so a role change or workspace switch takes effect on
  your very next request, no re-login needed.
- **API key** (`sk_...`, from Settings → API Keys) — tied to one workspace
  at creation; no `X-Workspace-Id` header needed.

Every route below requires one of these except the ones listed under
**Public** and `/api/health`. Rate limits: 300 req/min per IP globally, 20
req/min on `/api/plan`, 10 req/min on login/password-reset endpoints.

## Health

`GET /api/health` → `{ ok: true }` (no auth — for load balancers/uptime checks)

## Auth (Public: register, login, refresh, logout, request/reset password)

- `POST /api/auth/register` `{email, password, name}` → creates the user (the
  very first user on a fresh instance becomes system **owner**; everyone
  else is **member**) plus a personal workspace they own → `{accessToken, refreshToken, user, workspace}`
- `POST /api/auth/login` `{email, password}` → `{accessToken, refreshToken, user, workspaces[]}`.
  Locks the account for 15 minutes after 5 failed attempts (423).
- `POST /api/auth/refresh` `{refreshToken}` → rotates to a new pair; the
  old refresh token is invalidated (replay protection) → `{accessToken, refreshToken}`
- `POST /api/auth/logout` `{refreshToken}` → revokes that session
- `POST /api/auth/logout-all` *(auth)* → revokes every session for the caller
- `GET /api/auth/me` *(auth)* → `{user, workspaces[], activeWorkspaceId}`
- `PATCH /api/auth/me` *(auth)* `{name}` → update your display name
- `POST /api/auth/change-password` *(auth)* `{currentPassword, newPassword}` →
  revokes every other session on success
- `POST /api/auth/request-password-reset` `{email}` → always `200` regardless
  of whether the account exists (no enumeration); emails a reset link if
  SMTP is configured
- `POST /api/auth/reset-password` `{token, newPassword}` → revokes every
  session for that user on success

## Workspaces (all require auth)

- `GET /api/workspaces` → your memberships, each with your role
- `POST /api/workspaces` `{name}` → create a new workspace (you become owner)
- `GET /api/workspaces/current` → the active workspace's details
- `PATCH /api/workspaces/current` *(admin+)* `{name}` → rename
- `GET /api/workspaces/current/members`
- `PATCH /api/workspaces/current/members/:userId` *(admin+)* `{role}` —
  can't demote/remove the last owner; only an owner can grant owner
- `DELETE /api/workspaces/current/members/:userId` *(admin+)*
- `GET /api/workspaces/current/invites` *(admin+)*
- `POST /api/workspaces/current/invites` *(admin+)* `{email, role}` → emails
  an invite link if SMTP is configured; always returns `acceptUrl` so you
  can share it manually otherwise
- `DELETE /api/workspaces/current/invites/:id` *(admin+)*
- `POST /api/invites/accept` *(auth)* `{token}` → joins the inviting
  workspace; the invite's email must match your account's email

Role hierarchy (workspace-scoped): `viewer` < `member` < `admin` < `owner`.
Viewers can read; members can create/run automations; admin+ can manage
members, invites, API keys, and provider configs.

## API keys (all require auth)

- `GET /api/api-keys` — never returns the secret, only id/name/prefix/dates
- `POST /api/api-keys` *(admin+)* `{name}` → `{token, ...}` — **the only
  time the full key is returned**; only its hash is stored
- `DELETE /api/api-keys/:id` *(admin+)* → revoke

## Provider configs (all require auth)

- `GET /api/provider-configs` — `has_api_key: boolean`, never the key itself
- `PUT /api/provider-configs` *(admin+)* `{provider, apiKey?, model?, enabled?, isDefault?}`
- `DELETE /api/provider-configs/:provider` *(admin+)*

## Planning (nothing persisted)

`POST /api/plan` `{text}` → `{plan, rationale, source, templateId}`

## Automations (all require auth; mutating routes require member+)

- `POST /api/automations` `{plan}` → persists the plan returned by `/api/plan`
- `GET /api/automations` — active, non-deleted, this workspace only
- `GET /api/automations/:id`
- `POST /api/automations/:id/pause` / `/activate`
- `DELETE /api/automations/:id` — soft delete (runs stay in history)
- `POST /api/automations/:id/run` → `{runId}` (202, async — poll `/api/runs/:id`)

## Runs (all require auth)

- `GET /api/runs` — most recent 100 in this workspace
- `GET /api/runs/:id` → `{run, steps, approvals}`
- `POST /api/runs/:id/approvals/:approvalId` *(member+)* `{decision: "approved"|"rejected"}` —
  409 if already resolved

## Notifications (all require auth)

- `GET /api/notifications` — addressed to you or workspace-wide
- `POST /api/notifications/:id/read`

## Admin (system-level — owner/admin only, any workspace)

Mounted at `/api/admin/*`, distinct from the workspace-scoped routes above.

- `GET /api/admin/stats` — instance-wide counts
- `GET /api/admin/users?offset=` — every user on the instance
- `PATCH /api/admin/users/:id/status` `{status: "active"|"suspended"}` —
  suspension revokes all that user's sessions immediately
- `PATCH /api/admin/users/:id/role` `{role}` — only an owner can grant/revoke owner
- `GET /api/admin/workspaces?offset=` — every workspace, with member/automation counts
- `GET /api/admin/audit-log?offset=`
- `GET /api/admin/usage` — LLM/tool/browser usage aggregated per workspace

## Error shape

Non-2xx responses are `{ "error": string }` (validation failures also
include a `details: string[]` array from the zod schema). The workflow
engine's own failures surface inside `run.result_json`
(`{ failedStep, error }`) and on the specific `run_steps` row (`error`
column) — never silently dropped.
