-- Full multi-tenant schema. Every business table carries workspace_id and
-- all reads/writes go through helpers that scope by it (see db/scoped.ts).
-- Statements are idempotent; forward-evolving changes go in db/migrations.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_normalized TEXT NOT NULL UNIQUE, -- lowercased/trimmed, used for lookups
  password_hash TEXT NOT NULL,           -- scrypt: salt:N:r:p:derivedKey (see lib/crypto.ts)
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',   -- owner | admin | member (instance level)
  status TEXT NOT NULL DEFAULT 'active', -- active | suspended
  totp_secret_encrypted TEXT,            -- NULL until 2FA is enabled
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,                     -- brute-force lockout
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Refresh-token sessions. Access tokens are short-lived JWTs and are NOT stored.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE, -- sha256 of the opaque refresh token
  user_agent TEXT,
  ip TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member | viewer
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,              -- first 8 chars, shown in the UI for identification
  key_hash TEXT NOT NULL UNIQUE,     -- sha256 of the full key; the key itself is never stored
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Automations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  plan_json TEXT NOT NULL,                -- serialized WorkflowPlan
  status TEXT NOT NULL DEFAULT 'active',  -- draft | active | paused
  created_by TEXT NOT NULL,               -- 'ai' | 'human'
  requires_approval INTEGER NOT NULL DEFAULT 1,
  cron TEXT,
  timezone TEXT,
  next_run_at TEXT,
  last_run_at TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  webhook_token_hash TEXT UNIQUE,         -- set when trigger.type === 'webhook'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL,          -- pending_approval | queued | running | succeeded | failed | cancelled
  trigger_type TEXT NOT NULL,    -- manual | schedule | webhook
  triggered_by_user_id TEXT REFERENCES users(id),
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,          -- running | success | failed | skipped | waiting_approval
  attempt INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  output_json TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  label TEXT,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  requested_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_user_id TEXT REFERENCES users(id),
  UNIQUE(run_id, step_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,             -- e.g. a monitored URL
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(automation_id, key)
);

-- ---------------------------------------------------------------------------
-- Secrets & provider config
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,  -- AES-256-GCM envelope (see lib/crypto.ts)
  description TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, key)
);

CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,          -- openai | anthropic | gemini | local
  api_key_encrypted TEXT,
  model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, provider)
);

-- ---------------------------------------------------------------------------
-- Notifications & observability
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE, -- NULL = workspace-wide
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,          -- email | log | in_app
  level TEXT NOT NULL DEFAULT 'info', -- info | warning | error
  subject TEXT,
  body TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  delivery_error TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,           -- e.g. 'automation.create', 'user.suspend'
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,             -- llm_call | tool_call | browser_ms
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Indexes (every hot query path)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_email_norm ON users(email_normalized);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_apikeys_workspace ON api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automations_workspace ON automations(workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_automations_schedule ON automations(status, cron) WHERE cron IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_runs_workspace_created ON runs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_automation ON runs(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals(run_id);
CREATE INDEX IF NOT EXISTS idx_approvals_pending ON approvals(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(workspace_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_workspace ON usage_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_automation ON artifacts(automation_id, key);
