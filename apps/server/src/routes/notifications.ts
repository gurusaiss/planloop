import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export function notificationsRouter() {
  const router = Router();
  router.use(requireAuth);

  // Notifications addressed to this user, plus workspace-wide ones (user_id IS NULL).
  router.get("/notifications", (req, res) => {
    const rows = db
      .prepare(
        `SELECT * FROM notifications
         WHERE workspace_id = ? AND (user_id = ? OR user_id IS NULL)
         ORDER BY created_at DESC LIMIT 100`
      )
      .all(req.auth!.workspaceId, req.auth!.userId);
    res.json(rows);
  });

  router.post("/notifications/:id/read", (req, res) => {
    const result = db
      .prepare(
        `UPDATE notifications SET read_at = ? WHERE id = ? AND workspace_id = ? AND (user_id = ? OR user_id IS NULL) AND read_at IS NULL`
      )
      .run(new Date().toISOString(), req.params.id, req.auth!.workspaceId, req.auth!.userId);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  });

  return router;
}
