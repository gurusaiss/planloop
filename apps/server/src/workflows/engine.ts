import type { ToolDefinition, UsageRecord, WorkflowPlan, WorkflowStep } from "@automation/core";
import { db, newId } from "../db/index.js";
import { buildToolRegistry } from "../tools/index.js";
import { selectProviderForWorkspace } from "../providers/index.js";

const MAX_ATTEMPTS = 3;

export interface EngineDeps {
  workspaceId: string;
  automationId: string;
}

/**
 * Executes (or resumes) a run of a WorkflowPlan.
 *
 * Contract: PLAN -> PREVIEW (done before this is called, in the routes
 * layer) -> EXECUTE -> pause for APPROVAL on the first ungranted
 * medium/high risk step -> resume -> VERIFY (diff_snapshot /
 * schema-shaped tool outputs) -> RESULT. Nothing here ever auto-approves
 * a medium/high risk step.
 *
 * The AI provider is resolved per-workspace (selectProviderForWorkspace)
 * at the start of each execution, not passed in by the caller — so a
 * workspace that configures its own provider key gets it immediately on
 * the next run, without the route layer needing to know about provider
 * configs at all.
 */
export async function runWorkflow(runId: string, plan: WorkflowPlan, deps: EngineDeps): Promise<void> {
  const provider = selectProviderForWorkspace(deps.workspaceId);
  const tools = buildToolRegistry(provider);
  const outputs = new Map<string, unknown>();

  // Replay already-completed steps' outputs so resumed runs can still use
  // template interpolation for later steps.
  const priorSteps = db
    .prepare("SELECT step_id, output_json FROM run_steps WHERE run_id = ? AND status = 'success'")
    .all(runId) as { step_id: string; output_json: string | null }[];
  for (const s of priorSteps) {
    if (s.output_json) outputs.set(s.step_id, JSON.parse(s.output_json));
  }
  const alreadyDone = new Set(priorSteps.map((s) => s.step_id));

  const runStartedAt = getStartedAt(runId);
  setRunStatus(runId, "running", { started: !runStartedAt });

  for (const s of plan.steps) {
    if (alreadyDone.has(s.id)) continue;

    const effectiveRisk = maxRisk(s.riskLevel, s.tool ? tools.get(s.tool)?.riskLevel : undefined);
    if (s.kind === "approval" || effectiveRisk === "medium" || effectiveRisk === "high") {
      const approval = getOrCreateApproval(deps.workspaceId, runId, { ...s, riskLevel: effectiveRisk });
      if (approval.status !== "approved") {
        setRunStatus(runId, "pending_approval");
        logStep(deps.workspaceId, runId, s, "waiting_approval", { attempt: 1 });
        return; // pause; a later call to runWorkflow resumes from here
      }
    }

    const result = await executeStepWithRetry(s, outputs, tools, deps);
    if (!result.ok) {
      logStep(deps.workspaceId, runId, s, "failed", { attempt: result.attempt, error: result.error, durationMs: result.durationMs });
      finishRun(runId, "failed", runStartedAt, { failedStep: s.id, error: result.error });
      return;
    }
    outputs.set(s.id, result.output);
    logStep(deps.workspaceId, runId, s, "success", { attempt: result.attempt, output: result.output, durationMs: result.durationMs });
  }

  finishRun(runId, "succeeded", runStartedAt, { outputs: Object.fromEntries(outputs) });
  db.prepare("UPDATE automations SET last_run_at = ?, run_count = run_count + 1 WHERE id = ?").run(
    new Date().toISOString(),
    deps.automationId
  );
}

const RISK_RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * The planner labels each step's risk, but a tool also declares its own
 * intrinsic risk (see ToolDefinition.riskLevel). A planner bug or a
 * hand-edited plan that under-labels a step must never be allowed to skip
 * approval for an inherently risky tool, so the engine always takes the
 * higher of the two.
 */
function maxRisk(
  a: WorkflowStep["riskLevel"],
  b: WorkflowStep["riskLevel"] | undefined
): WorkflowStep["riskLevel"] {
  if (!b) return a;
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function getOrCreateApproval(workspaceId: string, runId: string, step: WorkflowStep) {
  const existing = db
    .prepare("SELECT * FROM approvals WHERE run_id = ? AND step_id = ?")
    .get(runId, step.id) as any;
  if (existing) return existing;

  const row = {
    id: newId("approval"),
    workspace_id: workspaceId,
    run_id: runId,
    step_id: step.id,
    label: step.label,
    risk_level: step.riskLevel,
    status: "pending",
    requested_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO approvals (id, workspace_id, run_id, step_id, label, risk_level, status, requested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(row.id, row.workspace_id, row.run_id, row.step_id, row.label, row.risk_level, row.status, row.requested_at);
  return row;
}

async function executeStepWithRetry(
  step: WorkflowStep,
  outputs: Map<string, unknown>,
  tools: Map<string, ToolDefinition>,
  deps: EngineDeps
): Promise<
  | { ok: true; output: unknown; attempt: number; durationMs: number }
  | { ok: false; error: string; attempt: number; durationMs: number }
> {
  const stepStartedAt = Date.now();
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (step.kind === "notify" || step.kind === "tool") {
        const toolName = step.tool ?? "notify";
        const tool = tools.get(toolName);
        if (!tool) throw new Error(`Unknown tool: ${toolName}`);
        const input = interpolate(step.input ?? {}, outputs);
        assertRequiredFields(tool, input);

        const usageEvents: UsageRecord[] = [];
        const output = await tool.run(input, {
          workspaceId: deps.workspaceId,
          automationId: deps.automationId,
          runId: "", // step-scoped ids are logged separately; kept simple for MVP
          stepId: step.id,
          credentials: {},
          recordUsage: (event) => usageEvents.push(event),
        });
        for (const event of usageEvents) recordUsage(deps.workspaceId, event);

        return { ok: true, output, attempt, durationMs: Date.now() - stepStartedAt };
      }
      // condition/loop/delay/parallel kinds are no-ops in the MVP engine.
      return { ok: true, output: null, attempt, durationMs: Date.now() - stepStartedAt };
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }
  return { ok: false, error: lastError, attempt: MAX_ATTEMPTS, durationMs: Date.now() - stepStartedAt };
}

function recordUsage(workspaceId: string, event: UsageRecord) {
  db.prepare(
    `INSERT INTO usage_events (id, workspace_id, kind, model, tokens_in, tokens_out, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId("usage"),
    workspaceId,
    event.kind,
    event.model ?? null,
    event.tokensIn ?? null,
    event.tokensOut ?? null,
    event.durationMs ?? null,
    new Date().toISOString()
  );
}

/**
 * Enforces each tool's declared `inputSchema.required` list before it ever
 * runs. ToolDefinition.inputSchema is otherwise documentation-only (see
 * docs/SECURITY.md — "malicious workflow definition" row); this closes the
 * most common failure mode of that gap (a hand-edited or mis-templated
 * plan missing a required field) without taking on a full JSON-schema
 * validator for the MVP.
 */
function assertRequiredFields(tool: ToolDefinition, input: Record<string, unknown>) {
  const required = (tool.inputSchema as { required?: string[] })?.required ?? [];
  const missing = required.filter((key) => input[key] === undefined || input[key] === null);
  if (missing.length > 0) {
    throw new Error(`Tool "${tool.name}" is missing required input field(s): ${missing.join(", ")}`);
  }
}

/** Resolves {{steps.X.output.field}} and the diff_snapshot join helper against prior outputs. */
function interpolate(input: Record<string, unknown>, outputs: Map<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") {
      resolved[key] = value;
      continue;
    }
    if (value === "{{joined:diff}}") {
      const parts: string[] = [];
      for (const [stepId, out] of outputs.entries()) {
        if (stepId.startsWith("diff_")) {
          const d = out as { changed: boolean; current: string };
          if (d.changed) parts.push(d.current);
        }
      }
      resolved[key] = parts.length > 0 ? parts.join("\n\n---\n\n") : "(no changes detected)";
      continue;
    }
    const match = value.match(/^\{\{steps\.([\w-]+)\.output\.([\w.]+)\}\}$/);
    if (match) {
      const [, stepId, field] = match;
      const out = outputs.get(stepId) as Record<string, any> | undefined;
      resolved[key] = field.split(".").reduce((acc, k) => acc?.[k], out) ?? "";
      continue;
    }
    resolved[key] = value;
  }
  return resolved;
}

function getStartedAt(runId: string): string | null {
  const row = db.prepare("SELECT started_at FROM runs WHERE id = ?").get(runId) as any;
  return row?.started_at ?? null;
}

function setRunStatus(runId: string, status: string, extra: { started?: boolean } = {}) {
  const now = new Date().toISOString();
  if (extra.started) {
    db.prepare("UPDATE runs SET status = ?, started_at = ? WHERE id = ?").run(status, now, runId);
  } else {
    db.prepare("UPDATE runs SET status = ? WHERE id = ?").run(status, runId);
  }
}

function finishRun(runId: string, status: "succeeded" | "failed", startedAt: string | null, result: unknown) {
  const now = new Date().toISOString();
  const durationMs = startedAt ? Date.now() - new Date(startedAt).getTime() : null;
  db.prepare("UPDATE runs SET status = ?, finished_at = ?, duration_ms = ?, result_json = ? WHERE id = ?").run(
    status,
    now,
    durationMs,
    JSON.stringify(result ?? {}),
    runId
  );
}

function logStep(
  workspaceId: string,
  runId: string,
  step: WorkflowStep,
  status: "success" | "failed" | "skipped" | "waiting_approval",
  extra: { attempt: number; output?: unknown; error?: string; durationMs?: number }
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run_steps (id, workspace_id, run_id, step_id, label, status, attempt, started_at, finished_at, duration_ms, output_json, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId("rs"),
    workspaceId,
    runId,
    step.id,
    step.label,
    status,
    extra.attempt,
    now,
    status === "waiting_approval" ? null : now,
    extra.durationMs ?? null,
    extra.output !== undefined ? JSON.stringify(extra.output) : null,
    extra.error ?? null
  );
}
