// Shared types for the automation platform.
// These are the stable contract every module builds against: new
// tools/agents/providers plug into these interfaces rather than requiring
// changes here.

// ---------------------------------------------------------------------------
// Identity & tenancy
// ---------------------------------------------------------------------------

/** Platform-level role. `owner` is the first user created (instance admin). */
export type SystemRole = "owner" | "admin" | "member";

/** Role within a single workspace. */
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export type UserStatus = "active" | "suspended";

export interface User {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  status: UserStatus;
  totpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
}

/** Resolved request identity attached to every authenticated request. */
export interface AuthContext {
  userId: string;
  email: string;
  systemRole: SystemRole;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  /** Present when the request authenticated with an API key rather than a session. */
  apiKeyId?: string;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "medium" | "high";

export interface ToolContext {
  workspaceId: string;
  automationId: string;
  runId: string;
  stepId: string;
  /** Decrypted workspace credentials, resolved lazily. Never logged verbatim. */
  credentials: Record<string, string>;
  /** Records billable/observable usage (llm tokens, browser ms, tool calls). */
  recordUsage?: (event: UsageRecord) => void;
  /** Cooperative cancellation — tools doing long work should honor this. */
  signal?: AbortSignal;
}

export interface ToolDefinition<Input = any, Output = any> {
  name: string;
  description: string;
  /** Declares intrinsic risk so the engine can require approval independently of the planner. */
  riskLevel: RiskLevel;
  /** JSON Schema describing accepted input. Enforced at the engine boundary. */
  inputSchema: Record<string, unknown>;
  run(input: Input, ctx: ToolContext): Promise<Output>;
}

export interface UsageRecord {
  kind: "llm_call" | "tool_call" | "browser_ms";
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export type StepKind =
  | "tool"
  | "condition"
  | "loop"
  | "delay"
  | "approval"
  | "notify"
  | "parallel";

export interface WorkflowStep {
  id: string;
  kind: StepKind;
  /** Tool name when kind === "tool" | "notify". */
  tool?: string;
  input?: Record<string, unknown>;
  riskLevel: RiskLevel;
  /** Human-readable description shown in the plan preview and logs. */
  label: string;

  /**
   * kind === "condition": an expression evaluated against prior step outputs
   * by the engine's safe evaluator (NOT eval) — e.g.
   * "steps.diff_0.output.changed == true".
   * Steps listed in `thenSteps` run when true, `elseSteps` when false.
   */
  condition?: string;
  thenSteps?: WorkflowStep[];
  elseSteps?: WorkflowStep[];

  /**
   * kind === "loop": iterates `forEach` (a template ref resolving to an array)
   * running `body` once per item, with `{{item}}` / `{{index}}` available.
   */
  forEach?: string;
  body?: WorkflowStep[];
  maxIterations?: number;

  /** kind === "parallel": children run concurrently. */
  branches?: WorkflowStep[][];

  /** kind === "delay": milliseconds to wait (capped by the engine). */
  delayMs?: number;

  /** Optional per-step overrides. */
  retries?: number;
  timeoutMs?: number;
  continueOnError?: boolean;
}

export type TriggerType = "manual" | "schedule" | "webhook";

export interface WorkflowTrigger {
  type: TriggerType;
  /** Cron expression, required when type === "schedule". */
  cron?: string;
  /** IANA timezone, e.g. "Asia/Kolkata". Defaults to UTC. */
  timezone?: string;
}

export interface WorkflowPlan {
  id: string;
  title: string;
  summary: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  /** True when any step requires human approval before it can run unattended. */
  requiresApproval: boolean;
  createdBy: "ai" | "human";
}

export type RunStatus =
  | "pending_approval"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RunStepStatus =
  | "running"
  | "success"
  | "failed"
  | "skipped"
  | "waiting_approval";

export interface RunStepLog {
  id: string;
  runId: string;
  stepId: string;
  label: string;
  status: RunStepStatus;
  startedAt: string;
  finishedAt?: string | null;
  output?: unknown;
  error?: string | null;
  attempt: number;
}

export interface Run {
  id: string;
  workspaceId: string;
  automationId: string;
  status: RunStatus;
  triggerType: TriggerType;
  triggeredByUserId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface Automation {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  title: string;
  summary: string;
  plan: WorkflowPlan;
  status: "draft" | "active" | "paused";
  requiresApproval: boolean;
  cron?: string | null;
  timezone?: string | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  workspaceId: string;
  runId: string;
  stepId: string;
  riskLevel: RiskLevel;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
}

// ---------------------------------------------------------------------------
// AI providers
// ---------------------------------------------------------------------------

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletion {
  text: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface LlmProvider {
  name: string;
  /** True for providers that never leave the local machine (privacy-safe by construction). */
  isLocal: boolean;
  complete(
    messages: LlmMessage[],
    opts?: { maxTokens?: number; temperature?: number; model?: string; signal?: AbortSignal }
  ): Promise<LlmCompletion>;
}

/** Task shape used by the model router to pick an appropriate model tier. */
export type TaskKind = "plan" | "summarize" | "classify" | "extract" | "long_context";

export interface PlannerResult {
  plan: WorkflowPlan;
  rationale: string;
  /** Which strategy produced the plan — surfaced in the UI, never hidden. */
  source: "llm" | "template" | "unsupported";
  /** Present when source === "template" or "unsupported". */
  templateId?: string;
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

export interface AuditEvent {
  id: string;
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
