import { Router, type RequestHandler } from "express";
import type { LlmProvider, WorkflowPlan } from "@automation/core";
import { db, newId, DEFAULT_WORKSPACE_ID } from "../db/index.js";
import { planFromText } from "../agents/planner.js";
import { runWorkflow } from "../workflows/engine.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody } from "../middleware/validate.js";
import { planRequestSchema, createAutomationSchema } from "../validation/schemas.js";

export function automationsRouter(provider: LlmProvider, planLimiter: RequestHandler) {
  const router = Router();

  // STEP 1 of the core loop: user describes the task in plain language,
  // the planner returns a preview plan. Nothing is persisted or executed yet.
  router.post(
    "/plan",
    planLimiter,
    validateBody(planRequestSchema),
    asyncHandler(async (req, res) => {
      const result = await planFromText({ text: req.body.text, provider });
      res.json(result);
    })
  );

  // STEP 2: user reviews the plan and activates it -> persisted as an automation.
  router.post("/automations", validateBody(createAutomationSchema), (req, res) => {
    const plan = req.body.plan as WorkflowPlan;
    const id = newId("auto");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO automations (id, workspace_id, title, summary, plan_json, status, created_by, requires_approval, cron, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
    ).run(
      id,
      DEFAULT_WORKSPACE_ID,
      plan.title,
      plan.summary,
      JSON.stringify(plan),
      plan.createdBy,
      plan.requiresApproval ? 1 : 0,
      plan.trigger.type === "schedule" ? plan.trigger.cron ?? null : null,
      now,
      now
    );
    res.status(201).json(getAutomation(id));
  });

  router.get("/automations", (_req, res) => {
    const rows = db
      .prepare("SELECT * FROM automations WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(DEFAULT_WORKSPACE_ID);
    res.json(rows.map(serializeAutomation));
  });

  router.get("/automations/:id", (req, res) => {
    const a = getAutomation(req.params.id);
    if (!a) return res.status(404).json({ error: "not found" });
    res.json(a);
  });

  router.post("/automations/:id/pause", (req, res) => {
    if (!getAutomationRaw(req.params.id)) return res.status(404).json({ error: "not found" });
    db.prepare("UPDATE automations SET status = 'paused', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      req.params.id
    );
    res.json(getAutomation(req.params.id));
  });

  router.post("/automations/:id/activate", (req, res) => {
    if (!getAutomationRaw(req.params.id)) return res.status(404).json({ error: "not found" });
    db.prepare("UPDATE automations SET status = 'active', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      req.params.id
    );
    res.json(getAutomation(req.params.id));
  });

  // STEP: run now (manual trigger), independent of any schedule.
  router.post(
    "/automations/:id/run",
    asyncHandler(async (req, res) => {
      const automation = getAutomationRaw(req.params.id);
      if (!automation) return res.status(404).json({ error: "not found" });
      const plan: WorkflowPlan = JSON.parse(automation.plan_json);

      const runId = newId("run");
      db.prepare(
        `INSERT INTO runs (id, workspace_id, automation_id, status, trigger_type, created_at)
         VALUES (?, ?, ?, 'queued', 'manual', ?)`
      ).run(runId, DEFAULT_WORKSPACE_ID, automation.id, new Date().toISOString());

      // Fire-and-forget: the run executes async; the client polls /runs/:id.
      runWorkflow(runId, plan, { provider, workspaceId: DEFAULT_WORKSPACE_ID, automationId: automation.id }).catch(
        (err) => {
          db.prepare("UPDATE runs SET status = 'failed', result_json = ? WHERE id = ?").run(
            JSON.stringify({ error: String(err) }),
            runId
          );
        }
      );

      res.status(202).json({ runId });
    })
  );

  return router;
}

function getAutomationRaw(id: string) {
  return db.prepare("SELECT * FROM automations WHERE id = ?").get(id) as any;
}
function getAutomation(id: string) {
  const row = getAutomationRaw(id);
  return row ? serializeAutomation(row) : null;
}
function serializeAutomation(row: any) {
  return { ...row, plan: JSON.parse(row.plan_json), plan_json: undefined, requires_approval: Boolean(row.requires_approval) };
}
