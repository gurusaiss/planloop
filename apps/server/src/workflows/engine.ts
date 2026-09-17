import type { LlmProvider, ToolDefinition, WorkflowPlan, WorkflowStep } from "@automation/core";
import { db, newId } from "../db/index.js";
import { buildToolRegistry } from "../tools/index.js";

const MAX_ATTEMPTS = 3;

export interface EngineDeps {
  provider: LlmProvider;
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
 */
export async function runWorkflow(runId: string, plan: WorkflowPlan, deps: EngineDeps): Promise<void> {
  const tools = buildToolRegistry(deps.provider, deps.workspaceId);
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

  setRunStatus(runId, "running", { started: !hasStarted(runId) });

  for (const s of plan.steps) {
    if (alreadyDone.has(s.id)) continue;

    const effectiveRisk = maxRisk(s.riskLevel, s.tool ? tools.get(s.tool)?.riskLevel : undefined);
    if (s.kind === "approval" || effectiveRisk === "medium" || effectiveRisk === "high") {
      const approval = getOrCreateApproval(runId, { ...s, riskLevel: effectiveRisk });
      if (approval.status !== "approved") {
        setRunStatus(runId, "pending_approval");
        logStep(runId, s, "waiting_approval", { attempt: 1 });
        return; // pause; a later call to runWorkflow resumes from here
      }
    }

    const result = await executeStepWithRetry(s, outputs, tools, deps);
    if (!result.ok) {
      logStep(runId, s, "failed", { attempt: result.attempt, error: result.error });
      setRunStatus(runId, "failed", { result: { failedStep: s.id, error: result.error } });
      return;
    }
    outputs.set(s.id, result.output);
    logStep(runId, s, "success", { attempt: result.attempt, output: result.output });
  }

  setRunStatus(runId, "succeeded", { result: { outputs: Object.fromEntries(outputs) } });
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

function getOrCreateApproval(runId: string, step: WorkflowStep) {
  const existing = db
    .prepare("SELECT * FROM approvals WHERE run_id = ? AND step_id = ?")
    .get(runId, step.id) as any;
  if (existing) return existing;

  const row = {
    id: newId("approval"),
    run_id: runId,
    step_id: step.id,
    risk_level: step.riskLevel,
    status: "pending",
    requested_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO approvals (id, run_id, step_id, risk_level, status, requested_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(row.id, row.run_id, row.step_id, row.risk_level, row.status, row.requested_at);
  return row;
}

async function executeStepWithRetry(
  step: WorkflowStep,
  outputs: Map<string, unknown>,
  tools: Map<string, ToolDefinition>,
  deps: EngineDeps
): Promise<{ ok: true; output: unknown; attempt: number } | { ok: false; error: string; attempt: number }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (step.kind === "notify" || step.kind === "tool") {
        const toolName = step.tool ?? "notify";
        const tool = tools.get(toolName);
        if (!tool) throw new Error(`Unknown tool: ${toolName}`);
        const input = interpolate(step.input ?? {}, outputs);
        const output = await tool.run(input, {
          workspaceId: deps.workspaceId,
          automationId: deps.automationId,
          runId: "", // step-scoped ids are logged separately; kept simple for MVP
          stepId: step.id,
          credentials: {},
        });
        return { ok: true, output, attempt };
      }
      // condition/loop/delay kinds are no-ops in the MVP engine.
      return { ok: true, output: null, attempt };
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }
  return { ok: false, error: lastError, attempt: MAX_ATTEMPTS };
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

function hasStarted(runId: string): boolean {
  const row = db.prepare("SELECT started_at FROM runs WHERE id = ?").get(runId) as any;
  return Boolean(row?.started_at);
}

function setRunStatus(
  runId: string,
  status: string,
  extra: { started?: boolean; result?: unknown } = {}
) {
  const now = new Date().toISOString();
  if (extra.started) {
    db.prepare("UPDATE runs SET status = ?, started_at = ? WHERE id = ?").run(status, now, runId);
  } else if (status === "succeeded" || status === "failed") {
    db.prepare("UPDATE runs SET status = ?, finished_at = ?, result_json = ? WHERE id = ?").run(
      status,
      now,
      JSON.stringify(extra.result ?? {}),
      runId
    );
  } else {
    db.prepare("UPDATE runs SET status = ? WHERE id = ?").run(status, runId);
  }
}

function logStep(
  runId: string,
  step: WorkflowStep,
  status: "success" | "failed" | "skipped" | "waiting_approval",
  extra: { attempt: number; output?: unknown; error?: string }
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run_steps (id, run_id, step_id, label, status, attempt, started_at, finished_at, output_json, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId("rs"),
    runId,
    step.id,
    step.label,
    status,
    extra.attempt,
    now,
    status === "waiting_approval" ? null : now,
    extra.output !== undefined ? JSON.stringify(extra.output) : null,
    extra.error ?? null
  );
}
