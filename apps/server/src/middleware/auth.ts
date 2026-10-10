import type { NextFunction, Request, Response } from "express";
import type { AuthContext, SystemRole, WorkspaceRole } from "@automation/core";
import { db } from "../db/index.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { sha256Hex } from "../lib/crypto.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

/**
 * Dual auth: a JWT access token (three dot-separated segments — normal
 * browser session) or an opaque API key (prefixed "sk_" — for
 * programmatic/integration use, see docs/API.md). Both resolve to the same
 * AuthContext shape so every downstream route only has to think about one
 * thing.
 *
 * Workspace is resolved fresh on every request (via the X-Workspace-Id
 * header, falling back to the user's oldest membership) rather than baked
 * into the JWT — so a role change or workspace switch takes effect
 * immediately without forcing a re-login.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const auth = token.startsWith("sk_") ? resolveApiKeyAuth(token) : resolveJwtAuth(token, req.header("x-workspace-id"));
    if (!auth) return res.status(401).json({ error: "Invalid or expired credentials" });
    req.auth = auth;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired credentials" });
  }
}

function resolveJwtAuth(token: string, requestedWorkspaceId: string | undefined): AuthContext | null {
  const payload = verifyAccessToken(token);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub) as any;
  if (!user || user.status !== "active") return null;

  const membership = requestedWorkspaceId
    ? (db
        .prepare("SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
        .get(requestedWorkspaceId, user.id) as any)
    : (db
        .prepare("SELECT * FROM workspace_members WHERE user_id = ? ORDER BY created_at ASC LIMIT 1")
        .get(user.id) as any);

  if (!membership) return null;

  return {
    userId: user.id,
    email: user.email,
    systemRole: user.role as SystemRole,
    workspaceId: membership.workspace_id,
    workspaceRole: membership.role as WorkspaceRole,
  };
}

function resolveApiKeyAuth(token: string): AuthContext | null {
  const row = db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(sha256Hex(token)) as any;
  if (!row || row.revoked_at) return null;

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id) as any;
  if (!user || user.status !== "active") return null;

  const membership = db
    .prepare("SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(row.workspace_id, row.user_id) as any;
  if (!membership) return null;

  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);

  return {
    userId: user.id,
    email: user.email,
    systemRole: user.role as SystemRole,
    workspaceId: row.workspace_id,
    workspaceRole: membership.role as WorkspaceRole,
    apiKeyId: row.id,
  };
}

/** Requires the caller's role in the active workspace to be >= `min`. */
export function requireWorkspaceRole(min: WorkspaceRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthenticated" });
    if (WORKSPACE_ROLE_RANK[req.auth.workspaceRole] < WORKSPACE_ROLE_RANK[min]) {
      return res.status(403).json({ error: `Requires workspace role >= ${min}` });
    }
    next();
  };
}

/** Requires system-level admin/owner — gates the /api/admin/* instance admin panel. */
export function requireSystemAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "Unauthenticated" });
  if (req.auth.systemRole !== "owner" && req.auth.systemRole !== "admin") {
    return res.status(403).json({ error: "Requires system admin" });
  }
  next();
}
