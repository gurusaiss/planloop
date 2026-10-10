import { Router } from "express";
import { db } from "../db/index.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth, requireSystemAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { updateUserStatusSchema, updateUserSystemRoleSchema } from "../validation/schemas.js";

/**
 * Instance admin panel — gated by system role (owner/admin), not workspace
 * role. This is "manage the whole deployment" (every user, every
 * workspace), distinct from routes/workspaces.ts which is "manage the
 * workspace I'm currently in."
 */
export function adminRouter() {
  const router = Router();
  router.use(requireAuth, requireSystemAdmin);

  router.get("/stats", (_req, res) => {
    const count = (sql: string) => (db.prepare(sql).get() as any).n as number;
    res.json({
      users: count("SELECT COUNT(*) as n FROM users"),
      activeUsers: count("SELECT COUNT(*) as n FROM users WHERE status = 'active'"),
      workspaces: count("SELECT COUNT(*) as n FROM workspaces"),
      automations: count("SELECT COUNT(*) as n FROM automations WHERE deleted_at IS NULL"),
      runsTotal: count("SELECT COUNT(*) as n FROM runs"),
      runsSucceeded: count("SELECT COUNT(*) as n FROM runs WHERE status = 'succeeded'"),
      runsFailed: count("SELECT COUNT(*) as n FROM runs WHERE status = 'failed'"),
      pendingApprovals: count("SELECT COUNT(*) as n FROM approvals WHERE status = 'pending'"),
    });
  });

  router.get("/users", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = db
      .prepare(
        `SELECT id, email, name, role, status, last_login_at, created_at
         FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
    const total = (db.prepare("SELECT COUNT(*) as n FROM users").get() as any).n;
    res.json({ items: rows, total, limit, offset });
  });

  router.patch(
    "/users/:id/status",
    validateBody(updateUserStatusSchema),
    (req, res) => {
      if (req.params.id === req.auth!.userId && req.body.status === "suspended") {
        return res.status(400).json({ error: "You cannot suspend your own account" });
      }
      const result = db
        .prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?")
        .run(req.body.status, new Date().toISOString(), req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: "not found" });

      if (req.body.status === "suspended") {
        // Immediately kill every active session — a suspension must take
        // effect now, not whenever that user's access token next expires.
        db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(
          new Date().toISOString(),
          req.params.id
        );
      }

      writeAudit({
        userId: req.auth!.userId,
        action: "admin.user.status_change",
        targetType: "user",
        targetId: req.params.id,
        metadata: { status: req.body.status },
      });
      res.json({ ok: true });
    }
  );

  router.patch(
    "/users/:id/role",
    validateBody(updateUserSystemRoleSchema),
    (req, res) => {
      // Only an existing owner can grant or revoke owner — an admin cannot
      // promote themselves or anyone else to owner.
      if ((req.body.role === "owner" || req.params.id === req.auth!.userId) && req.auth!.systemRole !== "owner") {
        return res.status(403).json({ error: "Only an owner can perform this change" });
      }
      const result = db
        .prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?")
        .run(req.body.role, new Date().toISOString(), req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: "not found" });

      writeAudit({
        userId: req.auth!.userId,
        action: "admin.user.role_change",
        targetType: "user",
        targetId: req.params.id,
        metadata: { role: req.body.role },
      });
      res.json({ ok: true });
    }
  );

  router.get("/workspaces", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = db
      .prepare(
        `SELECT w.id, w.name, w.slug, w.created_at,
                (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) as member_count,
                (SELECT COUNT(*) FROM automations a WHERE a.workspace_id = w.id AND a.deleted_at IS NULL) as automation_count
         FROM workspaces w ORDER BY w.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
    const total = (db.prepare("SELECT COUNT(*) as n FROM workspaces").get() as any).n;
    res.json({ items: rows, total, limit, offset });
  });

  router.get("/audit-log", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = db
      .prepare(
        `SELECT a.id, a.action, a.target_type, a.target_id, a.metadata_json, a.ip, a.created_at,
                u.email as user_email, w.name as workspace_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN workspaces w ON w.id = a.workspace_id
         ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
    const total = (db.prepare("SELECT COUNT(*) as n FROM audit_log").get() as any).n;
    res.json({ items: rows, total, limit, offset });
  });

  router.get("/usage", (req, res) => {
    const rows = db
      .prepare(
        `SELECT w.name as workspace_name, u.kind, COUNT(*) as events,
                SUM(COALESCE(u.tokens_in,0)) as tokens_in, SUM(COALESCE(u.tokens_out,0)) as tokens_out,
                SUM(COALESCE(u.duration_ms,0)) as duration_ms
         FROM usage_events u JOIN workspaces w ON w.id = u.workspace_id
         GROUP BY u.workspace_id, u.kind ORDER BY events DESC LIMIT 200`
      )
      .all();
    res.json(rows);
  });

  return router;
}
