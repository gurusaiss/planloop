// Shared types for the automation platform.
// These are intentionally small and stable — new tools/agents/providers
// plug into these interfaces rather than requiring changes here.

export type RiskLevel = "low" | "medium" | "high";

export interface ToolCallResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface ToolContext {
  workspaceId: string;
  automationId: string;
  runId: string;
  stepId: string;
  /** Resolved secrets/credentials for this workspace, never logged verbatim. */
  credentials: Record<string, string>;
}

export interface ToolDefinition<Input = any, Output = any> {
  name: string;
  description: string;
  /** Declares default risk so the workflow engine knows when approval is required. */
  riskLevel: RiskLevel;
  /** JSON-schema-ish shape used for validating planner-produced input. */
  inputSchema: Record<string, unknown>;
  run(input: Input, ctx: ToolContext): Promise<Output>;
}

export type StepKind =
  | "tool"
  | "condition"
  | "loop"
  | "delay"
  | "approval"
  | "notify";

export interface WorkflowStep {
  id: string;
  kind: StepKind;
  /** Tool name when kind === "tool". */
  tool?: string;
  input?: Record<string, unknown>;
  riskLevel: RiskLevel;
  /** Human-readable description shown in the plan preview and logs. */
  label: string;
  /** Optional: only relevant for kind === "condition" / "loop". */
  condition?: string;
  onErrorStepId?: string;
}

export type TriggerType = "manual" | "schedule" | "webhook";

export interface WorkflowTrigger {
  type: TriggerType;
  /** Cron expression, required when type === "schedule". */
  cron?: string;
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

export interface RunStepLog {
  stepId: string;
  label: string;
  status: "success" | "failed" | "skipped" | "waiting_approval";
  startedAt: string;
  finishedAt?: string;
  output?: unknown;
  error?: string;
  attempt: number;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProvider {
  name: string;
  /** True for providers that never leave the local machine (privacy-safe by construction). */
  isLocal: boolean;
  complete(messages: LlmMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

export interface PlannerResult {
  plan: WorkflowPlan;
  rationale: string;
}
