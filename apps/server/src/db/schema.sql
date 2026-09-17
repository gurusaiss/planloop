-- MVP schema. Every business table carries workspace_id so the same
-- schema scales to real multi-tenancy later (today there is exactly one
-- workspace, created on first boot).

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  plan_json TEXT NOT NULL,       -- serialized WorkflowPlan
  status TEXT NOT NULL DEFAULT 'draft', -- draft | active | paused
  created_by TEXT NOT NULL,      -- 'ai' | 'human'
  requires_approval INTEGER NOT NULL DEFAULT 1,
  cron TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  automation_id TEXT NOT NULL REFERENCES automations(id),
  status TEXT NOT NULL,          -- pending_approval | queued | running | succeeded | failed | cancelled
  trigger_type TEXT NOT NULL,    -- manual | schedule | webhook
  started_at TEXT,
  finished_at TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  step_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,          -- success | failed | skipped | waiting_approval
  attempt INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  output_json TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  step_id TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  requested_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, key)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT,
  channel TEXT NOT NULL,   -- 'email' | 'log'
  subject TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  automation_id TEXT NOT NULL REFERENCES automations(id),
  key TEXT NOT NULL,             -- e.g. a monitored URL
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(automation_id, key)
);

CREATE INDEX IF NOT EXISTS idx_runs_automation ON runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals(run_id);
