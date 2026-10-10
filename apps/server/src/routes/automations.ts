import { Router, type RequestHandler } from "express";
import type { WorkflowPlan } from "@automation/core";
import { db, newId } from "../db/index.js";
import { planFromText } from "../agents/planner.js";
import { runWorkflow } from "../workflows/engine.js";
import { selectProviderForWorkspace } from "../providers/index.js";
import { writeAudit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody } from "../middleware/validate.js";
import { requireAuth, requireWorkspaceRole } from "../middleware/auth.js";
import { planRequestSchema, createAutomationSchema } from "../validation/schemas.js";

export function automationsRouter(planLimiter: RequestHandler) {
  const router = Router();
  router.use(requireAuth);

  // STEP 1 of the core loop: user describes the task in plain language,
  // the planner returns a preview plan. Nothing is persisted or executed yet.
  router.post(
    "/plan",
    planLimiter,
    validateBody(planRequestSchema),
    asyncHandler(async (req, res) => {
      const provider = selectProviderForWorkspace(req.auth!.workspaceId);
      const result = await planFromText({ text: req.body.text, provider });
      res.json(result);
    })
  );

  // STEP 2: user reviews the plan and activates it -> persisted as an automation.
  router.post(
    "/automations",
    requireWorkspaceRole("member"),
    validateBody(createAutomationSchema),
    (req, res) => {
      const plan = req.body.plan as WorkflowPlan;
      const id = newId("auto");
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO automations (id, workspace_id, created_by_user_id, title, summary, plan_json, status, created_by, requires_approval, cron, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
      ).run(
        id,
        req.auth!.workspaceId,
        req.auth!.userId,
        plan.title,
        plan.summary,
        JSON.stringify(plan),
        plan.createdBy,
        plan.requiresApproval ? 1 : 0,
        plan.trigger.type === "schedule" ? plan.trigger.cron ?? null : null,
        now,
        now
      );
      writeAudit({
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        action: "automation.create",
        targetType: "automation",
        targetId: id,
      });
      res.status(201).json(getAutomation(req.auth!.workspaceId, id));
    }
  );

  router.get("/automations", (req, res) => {
    const rows = db
      .prepare(
        "SELECT * FROM automations WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC"
      )
      .all(req.auth!.workspaceId);
    res.json(rows.map(serializeAutomation));
  });

  router.get("/automations/:id", (req, res) => {
    const a = getAutomation(req.auth!.workspaceId, req.params.id);
    if (!a) return res.status(404).json({ error: "not found" });
    res.json(a);
  });

  router.post("/automations/:id/pause", requireWorkspaceRole("member"), (req, res) => {
    const result = db
      .prepare("UPDATE automations SET status = 'paused', updated_at = ? WHERE id = ? AND workspace_id = ?")
      .run(new Date().toISOString(), req.params.id, req.auth!.workspaceId);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });
    res.json(getAutomation(req.auth!.workspaceId, req.params.id));
  });

  router.post("/automations/:id/activate", requireWorkspaceRole("member"), (req, res) => {
    const result = db
      .prepare("UPDATE automations SET status = 'active', updated_at = ? WHERE id = ? AND workspace_id = ?")
      .run(new Date().toISOString(), req.params.id, req.auth!.workspaceId);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });
    res.json(getAutomation(req.auth!.workspaceId, req.params.id));
  });

  router.delete("/automations/:id", requireWorkspaceRole("member"), (req, res) => {
    const result = db
      .prepare("UPDATE automations SET deleted_at = ?, status = 'paused' WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL")
      .run(new Date().toISOString(), req.params.id, req.auth!.workspaceId);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });
    writeAudit({
      workspaceId: req.auth!.workspaceId,
      userId: req.auth!.userId,
      action: "automation.delete",
      targetType: "automation",
      targetId: req.params.id,
    });
    res.json({ ok: true });
  });

  // STEP: run now (manual trigger), independent of any schedule.
  router.post(
    "/automations/:id/run",
    requireWorkspaceRole("member"),
    asyncHandler(async (req, res) => {
      const automation = getAutomationRaw(req.auth!.workspaceId, req.params.id);
      if (!automation) return res.status(404).json({ error: "not found" });
      const plan: WorkflowPlan = JSON.parse(automation.plan_json);

      const runId = newId("run");
      db.prepare(
        `INSERT INTO runs (id, workspace_id, automation_id, status, trigger_type, triggered_by_user_id, created_at)
         VALUES (?, ?, ?, 'queued', 'manual', ?, ?)`
      ).run(runId, req.auth!.workspaceId, automation.id, req.auth!.userId, new Date().toISOString());

      // Fire-and-forget: the run executes async; the client polls /runs/:id.
      runWorkflow(runId, plan, { workspaceId: req.auth!.workspaceId, automationId: automation.id }).catch((err) => {
        db.prepare("UPDATE runs SET status = 'failed', error = ? WHERE id = ?").run(String(err), runId);
      });

      res.status(202).json({ runId });
    })
  );

  return router;
}

function getAutomationRaw(workspaceId: string, id: string) {
  return db.prepare("SELECT * FROM automations WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as any;
}
function getAutomation(workspaceId: string, id: string) {
  const row = getAutomationRaw(workspaceId, id);
  return row ? serializeAutomation(row) : null;
}
function serializeAutomation(row: any) {
  return {
    ...row,
    plan: JSON.parse(row.plan_json),
    plan_json: undefined,
    requires_approval: Boolean(row.requires_approval),
  };
}
