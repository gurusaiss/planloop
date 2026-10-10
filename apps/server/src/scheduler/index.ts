import cron from "node-cron";
import type { WorkflowPlan } from "@automation/core";
import { db, newId } from "../db/index.js";
import { runWorkflow } from "../workflows/engine.js";

const scheduled = new Map<string, cron.ScheduledTask>();

/**
 * Polls the automations table every minute, across every workspace, for
 * active cron-triggered automations and (re)registers node-cron jobs.
 * Polling (rather than a one-time boot-time scan) means a newly activated
 * automation is picked up without a server restart, and a paused one stops
 * firing within a minute. Each automation's own `workspace_id` drives which
 * workspace's AI provider config and tenant-scoped data its run uses — the
 * scheduler itself is instance-wide, not workspace-scoped.
 */
export function startScheduler() {
  const sync = () => {
    const active = db
      .prepare("SELECT * FROM automations WHERE status = 'active' AND cron IS NOT NULL AND deleted_at IS NULL")
      .all() as any[];

    const activeIds = new Set(active.map((a) => a.id));
    for (const [id, task] of scheduled) {
      if (!activeIds.has(id)) {
        task.stop();
        scheduled.delete(id);
      }
    }

    for (const automation of active) {
      if (scheduled.has(automation.id)) continue;
      if (!cron.validate(automation.cron)) continue;
      const task = cron.schedule(automation.cron, () => triggerRun(automation), {
        timezone: automation.timezone || "UTC",
      });
      scheduled.set(automation.id, task);
    }
  };

  sync();
  setInterval(sync, 60_000);
}

function triggerRun(automation: any) {
  // Idempotency guard: skip if a run for this automation is already in
  // flight, so a slow previous run can't overlap with the next tick.
  const inFlight = db
    .prepare(
      "SELECT id FROM runs WHERE automation_id = ? AND status IN ('queued','running','pending_approval')"
    )
    .get(automation.id);
  if (inFlight) return;

  const plan: WorkflowPlan = JSON.parse(automation.plan_json);
  const runId = newId("run");
  db.prepare(
    `INSERT INTO runs (id, workspace_id, automation_id, status, trigger_type, created_at)
     VALUES (?, ?, ?, 'queued', 'schedule', ?)`
  ).run(runId, automation.workspace_id, automation.id, new Date().toISOString());

  runWorkflow(runId, plan, { workspaceId: automation.workspace_id, automationId: automation.id }).catch((err) => {
    db.prepare("UPDATE runs SET status = 'failed', error = ? WHERE id = ?").run(String(err), runId);
  });
}
