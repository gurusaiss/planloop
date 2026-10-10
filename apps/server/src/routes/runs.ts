import { Router } from "express";
import type { WorkflowPlan } from "@automation/core";
import { db } from "../db/index.js";
import { runWorkflow } from "../workflows/engine.js";
import { writeAudit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody } from "../middleware/validate.js";
import { requireAuth, requireWorkspaceRole } from "../middleware/auth.js";
import { approvalDecisionSchema } from "../validation/schemas.js";

export function runsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/runs", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const rows = db
      .prepare("SELECT * FROM runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(req.auth!.workspaceId, limit);
    res.json(rows);
  });

  router.get("/runs/:id", (req, res) => {
    const run = db
      .prepare("SELECT * FROM runs WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, req.auth!.workspaceId);
    if (!run) return res.status(404).json({ error: "not found" });
    const steps = db
      .prepare("SELECT * FROM run_steps WHERE run_id = ? ORDER BY started_at ASC")
      .all(req.params.id);
    const approvals = db.prepare("SELECT * FROM approvals WHERE run_id = ?").all(req.params.id);
    res.json({ run, steps, approvals });
  });

  router.post(
    "/runs/:id/approvals/:approvalId",
    requireWorkspaceRole("member"),
    validateBody(approvalDecisionSchema),
    asyncHandler(async (req, res) => {
      const decision = req.body.decision as "approved" | "rejected";
      const approval = db
        .prepare("SELECT * FROM approvals WHERE id = ? AND workspace_id = ?")
        .get(req.params.approvalId, req.auth!.workspaceId) as any;
      if (!approval || approval.run_id !== req.params.id) return res.status(404).json({ error: "not found" });
      if (approval.status !== "pending") {
        return res.status(409).json({ error: `approval already ${approval.status}` });
      }

      db.prepare("UPDATE approvals SET status = ?, resolved_at = ?, resolved_by_user_id = ? WHERE id = ?").run(
        decision,
        new Date().toISOString(),
        req.auth!.userId,
        approval.id
      );
      writeAudit({
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        action: `approval.${decision}`,
        targetType: "run",
        targetId: req.params.id,
        metadata: { stepId: approval.step_id },
      });

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

      runWorkflow(req.params.id, plan, {
        workspaceId: req.auth!.workspaceId,
        automationId: automation.id,
      }).catch((err) => {
        db.prepare("UPDATE runs SET status = 'failed', error = ? WHERE id = ?").run(String(err), req.params.id);
      });

      res.json({ status: "resumed" });
    })
  );

  return router;
}
