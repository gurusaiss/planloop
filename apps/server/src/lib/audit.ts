import { db, newId } from "../db/index.js";

/**
 * Every state-changing action that matters for a security/ops review goes
 * through here — never a bare INSERT scattered in a route. Keeping one
 * entry point means `docs/SECURITY.md`'s audit-log claim stays true as the
 * app grows instead of silently rotting.
 */
export function writeAudit(event: {
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}) {
  db.prepare(
    `INSERT INTO audit_log (id, workspace_id, user_id, action, target_type, target_id, metadata_json, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId("audit"),
    event.workspaceId ?? null,
    event.userId ?? null,
    event.action,
    event.targetType ?? null,
    event.targetId ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null,
    event.ip ?? null,
    new Date().toISOString()
  );
}
