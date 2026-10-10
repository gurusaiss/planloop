import { Router } from "express";
import { db, newId } from "../db/index.js";
import { generateToken } from "../lib/crypto.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth, requireWorkspaceRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createApiKeySchema } from "../validation/schemas.js";

export function apiKeysRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/api-keys", (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, name, prefix, last_used_at, revoked_at, created_at
         FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC`
      )
      .all(req.auth!.workspaceId);
    res.json(rows);
  });

  router.post(
    "/api-keys",
    requireWorkspaceRole("admin"),
    validateBody(createApiKeySchema),
    (req, res) => {
      const { token, hash, visiblePrefix } = generateToken("sk");
      const id = newId("key");
      db.prepare(
        `INSERT INTO api_keys (id, workspace_id, user_id, name, prefix, key_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, req.auth!.workspaceId, req.auth!.userId, req.body.name, visiblePrefix, hash, new Date().toISOString());

      writeAudit({
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        action: "apikey.create",
        targetType: "api_key",
        targetId: id,
      });

      // The full key is only ever returned here, at creation time — it is
      // not retrievable again (only `key_hash` is stored). See docs/SECURITY.md.
      res.status(201).json({ id, name: req.body.name, token, prefix: visiblePrefix });
    }
  );

  router.delete("/api-keys/:id", requireWorkspaceRole("admin"), (req, res) => {
    const result = db
      .prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), req.params.id, req.auth!.workspaceId);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });

    writeAudit({
      workspaceId: req.auth!.workspaceId,
      userId: req.auth!.userId,
      action: "apikey.revoke",
      targetType: "api_key",
      targetId: req.params.id,
    });
    res.json({ ok: true });
  });

  return router;
}
