import { Router } from "express";
import type { LlmProvider, WorkflowPlan } from "@automation/core";
import { db, DEFAULT_WORKSPACE_ID } from "../db/index.js";
import { runWorkflow } from "../workflows/engine.js";

export function runsRouter(provider: LlmProvider) {
  const router = Router();

  router.get("/runs", (_req, res) => {
    const rows = db
      .prepare("SELECT * FROM runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100")
      .all(DEFAULT_WORKSPACE_ID);
    res.json(rows);
  });

  router.get("/runs/:id", (req, res) => {
    const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.id);
    if (!run) return res.status(404).json({ error: "not found" });
    const steps = db
      .prepare("SELECT * FROM run_steps WHERE run_id = ? ORDER BY started_at ASC")
      .all(req.params.id);
    const approvals = db.prepare("SELECT * FROM approvals WHERE run_id = ?").all(req.params.id);
    res.json({ run, steps, approvals });
  });

  router.post("/runs/:id/approvals/:approvalId", async (req, res) => {
    const decision = req.body?.decision; // 'approved' | 'rejected'
    if (decision !== "approved" && decision !== "rejected") {
      return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
    }
    const approval = db.prepare("SELECT * FROM approvals WHERE id = ?").get(req.params.approvalId) as any;
    if (!approval || approval.run_id !== req.params.id) return res.status(404).json({ error: "not found" });

    db.prepare("UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?").run(
      decision,
      new Date().toISOString(),
      "human",
      approval.id
    );

    if (decision === "rejected") {
      db.prepare("UPDATE runs SET status = 'cancelled', finished_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        req.params.id
      );
      return res.json({ status: "cancelled" });
    }

    const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.id) as any;
    const automation = db.prepare("SELECT * FROM automations WHERE id = ?").get(run.automation_id) as any;
    const plan: WorkflowPlan = JSON.parse(automation.plan_json);

    runWorkflow(req.params.id, plan, { provider, workspaceId: DEFAULT_WORKSPACE_ID, automationId: automation.id }).catch((err) => {
      db.prepare("UPDATE runs SET status = 'failed', result_json = ? WHERE id = ?").run(
        JSON.stringify({ error: String(err) }),
        req.params.id
      );
    });

    res.json({ status: "resumed" });
  });

  return router;
}
