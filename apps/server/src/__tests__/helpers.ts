import { db, newId } from "../db/index.js";

/** Minimal valid rows to satisfy FKs — tests that need real auth behavior use lib/crypto's hashPassword directly instead. */
export function seedUser(overrides: Partial<{ email: string; name: string; role: string; status: string }> = {}) {
  const id = newId("user");
  const now = new Date().toISOString();
  const email = overrides.email ?? `${id}@example.com`;
  db.prepare(
    `INSERT INTO users (id, email, email_normalized, password_hash, name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    email,
    email.toLowerCase(),
    "scrypt:1:1:1:00:00", // never verified in these tests — placeholder only
    overrides.name ?? "Test User",
    overrides.role ?? "member",
    overrides.status ?? "active",
    now,
    now
  );
  return { id, email };
}

export function seedWorkspace(ownerUserId: string, name = "Test Workspace") {
  const id = newId("ws");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO workspaces (id, name, slug, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, `${id}-slug`, ownerUserId, now, now);
  return id;
}

export function seedMembership(workspaceId: string, userId: string, role = "owner") {
  db.prepare(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(newId("member"), workspaceId, userId, role, new Date().toISOString());
}

/** A user who owns a fresh workspace they're a member of — the common case for tests. */
export function seedTenant(role: "owner" | "admin" | "member" | "viewer" = "owner") {
  const user = seedUser();
  const workspaceId = seedWorkspace(user.id);
  seedMembership(workspaceId, user.id, role);
  return { userId: user.id, email: user.email, workspaceId };
}

export function seedAutomation(
  workspaceId: string,
  userId: string,
  overrides: Partial<{
    title: string;
    summary: string;
    planJson: string;
    status: string;
    requiresApproval: boolean;
    cron: string | null;
  }> = {}
) {
  const id = newId("auto");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO automations (id, workspace_id, created_by_user_id, title, summary, plan_json, status, created_by, requires_approval, cron, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?)`
  ).run(
    id,
    workspaceId,
    userId,
    overrides.title ?? "t",
    overrides.summary ?? "s",
    overrides.planJson ?? "{}",
    overrides.status ?? "active",
    overrides.requiresApproval ? 1 : 0,
    overrides.cron ?? null,
    now,
    now
  );
  return id;
}

export function seedRun(workspaceId: string, automationId: string) {
  const id = newId("run");
  db.prepare(
    `INSERT INTO runs (id, workspace_id, automation_id, status, trigger_type, created_at) VALUES (?, ?, ?, 'queued', 'manual', ?)`
  ).run(id, workspaceId, automationId, new Date().toISOString());
  return id;
}
