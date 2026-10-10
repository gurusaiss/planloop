import { Router } from "express";
import { db, newId } from "../db/index.js";
import { encryptSecret } from "../lib/crypto.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth, requireWorkspaceRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { upsertProviderConfigSchema } from "../validation/schemas.js";

export function providerConfigsRouter() {
  const router = Router();
  router.use(requireAuth);

  // Never returns the decrypted key — only whether one is set.
  router.get("/provider-configs", (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, provider, model, enabled, is_default,
                (api_key_encrypted IS NOT NULL) as has_api_key, created_at, updated_at
         FROM provider_configs WHERE workspace_id = ? ORDER BY created_at ASC`
      )
      .all(req.auth!.workspaceId) as any[];
    res.json(rows.map((r) => ({ ...r, has_api_key: Boolean(r.has_api_key) })));
  });

  router.put(
    "/provider-configs",
    requireWorkspaceRole("admin"),
    validateBody(upsertProviderConfigSchema),
    (req, res) => {
      const { provider, apiKey, model, enabled, isDefault } = req.body;
      const now = new Date().toISOString();

      const existing = db
        .prepare("SELECT * FROM provider_configs WHERE workspace_id = ? AND provider = ?")
        .get(req.auth!.workspaceId, provider) as any;

      if (isDefault) {
        // Only one default per workspace.
        db.prepare("UPDATE provider_configs SET is_default = 0 WHERE workspace_id = ?").run(req.auth!.workspaceId);
      }

      const encryptedKey = apiKey ? encryptSecret(apiKey) : existing?.api_key_encrypted ?? null;

      if (existing) {
        db.prepare(
          `UPDATE provider_configs SET api_key_encrypted = ?, model = ?, enabled = ?, is_default = ?, updated_at = ?
           WHERE id = ?`
        ).run(
          encryptedKey,
          model ?? existing.model,
          enabled === undefined ? existing.enabled : enabled ? 1 : 0,
          isDefault ? 1 : existing.is_default,
          now,
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO provider_configs (id, workspace_id, provider, api_key_encrypted, model, enabled, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newId("pcfg"),
          req.auth!.workspaceId,
          provider,
          encryptedKey,
          model ?? null,
          enabled === false ? 0 : 1,
          isDefault ? 1 : 0,
          now,
          now
        );
      }

      writeAudit({
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        action: "provider_config.upsert",
        targetType: "provider_config",
        metadata: { provider, model, isDefault: Boolean(isDefault) },
      });
      res.json({ ok: true });
    }
  );

  router.delete("/provider-configs/:provider", requireWorkspaceRole("admin"), (req, res) => {
    const result = db
      .prepare("DELETE FROM provider_configs WHERE workspace_id = ? AND provider = ?")
      .run(req.auth!.workspaceId, req.params.provider);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });
    writeAudit({
      workspaceId: req.auth!.workspaceId,
      userId: req.auth!.userId,
      action: "provider_config.delete",
      metadata: { provider: req.params.provider },
    });
    res.json({ ok: true });
  });

  return router;
}
