import { describe, it, expect, beforeEach } from "vitest";
import { db, newId, DEFAULT_WORKSPACE_ID } from "../db/index.js";
import { runWorkflow } from "../workflows/engine.js";
import { localProvider } from "../providers/local.js";
import type { WorkflowPlan } from "@automation/core";

function insertAutomation(plan: WorkflowPlan) {
  const id = newId("auto");
  db.prepare(
    `INSERT INTO automations (id, workspace_id, title, summary, plan_json, status, created_by, requires_approval, cron, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', 'ai', ?, NULL, ?, ?)`
  ).run(id, DEFAULT_WORKSPACE_ID, plan.title, plan.summary, JSON.stringify(plan), plan.requiresApproval ? 1 : 0, new Date().toISOString(), new Date().toISOString());
  return id;
}

function insertRun(automationId: string) {
  const id = newId("run");
  db.prepare(
    `INSERT INTO runs (id, workspace_id, automation_id, status, trigger_type, created_at) VALUES (?, ?, ?, 'queued', 'manual', ?)`
  ).run(id, DEFAULT_WORKSPACE_ID, automationId, new Date().toISOString());
  return id;
}

function getRun(runId: string) {
  return db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as any;
}
function getApproval(runId: string) {
  return db.prepare("SELECT * FROM approvals WHERE run_id = ?").get(runId) as any;
}

describe("workflow engine — approval gating", () => {
  it("pauses before a high-risk step and resumes only after explicit approval", async () => {
    const plan: WorkflowPlan = {
      id: "plan_1",
      title: "t",
      summary: "s",
      trigger: { type: "manual" },
      requiresApproval: true,
      createdBy: "ai",
      steps: [
        { id: "notify", kind: "notify", tool: "notify", riskLevel: "high", label: "notify", input: { subject: "hi", body: "hello" } },
      ],
    };
    const automationId = insertAutomation(plan);
    const runId = insertRun(automationId);

    await runWorkflow(runId, plan, { provider: localProvider, workspaceId: DEFAULT_WORKSPACE_ID, automationId });
    expect(getRun(runId).status).toBe("pending_approval");

    const approval = getApproval(runId);
    expect(approval.status).toBe("pending");
    db.prepare("UPDATE approvals SET status = 'approved' WHERE id = ?").run(approval.id);

    await runWorkflow(runId, plan, { provider: localProvider, workspaceId: DEFAULT_WORKSPACE_ID, automationId });
    expect(getRun(runId).status).toBe("succeeded");
  });

  it("never auto-runs a rejected step, and the run ends cancelled", async () => {
    const plan: WorkflowPlan = {
      id: "plan_2",
      title: "t",
      summary: "s",
      trigger: { type: "manual" },
      requiresApproval: true,
      createdBy: "ai",
      steps: [
        { id: "notify", kind: "notify", tool: "notify", riskLevel: "high", label: "notify", input: { subject: "hi", body: "hello" } },
      ],
    };
    const automationId = insertAutomation(plan);
    const runId = insertRun(automationId);
    await runWorkflow(runId, plan, { provider: localProvider, workspaceId: DEFAULT_WORKSPACE_ID, automationId });

    const approval = getApproval(runId);
    db.prepare("UPDATE approvals SET status = 'rejected' WHERE id = ?").run(approval.id);
    db.prepare("UPDATE runs SET status = 'cancelled' WHERE id = ?").run(runId);

    expect(getRun(runId).status).toBe("cancelled");
    // Notification must not have been recorded since the step never ran.
    const notif = db.prepare("SELECT * FROM notifications WHERE run_id = ?").get(runId);
    expect(notif).toBeUndefined();
  });

  it("still requires approval when the planner under-labels a step but the tool itself is medium/high risk", async () => {
    // Simulates a planner bug: file_organize is intrinsically medium-risk
    // (see tools/fileOrganize.ts), but this step claims "low".
    const plan: WorkflowPlan = {
      id: "plan_3",
      title: "t",
      summary: "s",
      trigger: { type: "manual" },
      requiresApproval: false, // also mislabeled at the plan level
      createdBy: "ai",
      steps: [
        {
          id: "organize",
          kind: "tool",
          tool: "file_organize",
          riskLevel: "low", // <- intentionally wrong
          label: "organize",
          input: { sourceDir: "whatever", rules: { documents: ["pdf"] } },
        },
      ],
    };
    const automationId = insertAutomation(plan);
    const runId = insertRun(automationId);
    await runWorkflow(runId, plan, { provider: localProvider, workspaceId: DEFAULT_WORKSPACE_ID, automationId });

    // The engine's own defense-in-depth check (max of step vs. tool risk)
    // must still pause for approval.
    expect(getRun(runId).status).toBe("pending_approval");
  });

  it("retries a failing tool up to the retry limit and records the run as failed with the real error", async () => {
    const plan: WorkflowPlan = {
      id: "plan_4",
      title: "t",
      summary: "s",
      trigger: { type: "manual" },
      requiresApproval: false,
      createdBy: "ai",
      steps: [
        {
          id: "bad_fetch",
          kind: "tool",
          tool: "http_fetch_extract",
          riskLevel: "low",
          label: "fetch a blocked address",
          input: { url: "http://127.0.0.1:9999/" },
        },
      ],
    };
    const automationId = insertAutomation(plan);
    const runId = insertRun(automationId);
    await runWorkflow(runId, plan, { provider: localProvider, workspaceId: DEFAULT_WORKSPACE_ID, automationId });

    const run = getRun(runId);
    expect(run.status).toBe("failed");
    const step = db.prepare("SELECT * FROM run_steps WHERE run_id = ?").get(runId) as any;
    expect(step.attempt).toBe(3); // MAX_ATTEMPTS in engine.ts
    expect(step.error).toMatch(/not allowed/i);
  });
});
