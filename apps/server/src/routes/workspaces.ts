import { Router } from "express";
import { db, newId, normalizeEmail, slugify } from "../db/index.js";
import { generateToken, sha256Hex } from "../lib/crypto.js";
import { sendMail } from "../lib/mailer.js";
import { writeAudit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody } from "../middleware/validate.js";
import { requireAuth, requireWorkspaceRole } from "../middleware/auth.js";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  acceptInviteSchema,
  updateMemberRoleSchema,
} from "../validation/schemas.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function workspacesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/workspaces", (req, res) => {
    const rows = db
      .prepare(
        `SELECT w.id, w.name, w.slug, m.role
         FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.user_id = ? ORDER BY m.created_at ASC`
      )
      .all(req.auth!.userId);
    res.json(rows);
  });

  router.post(
    "/workspaces",
    validateBody(createWorkspaceSchema),
    asyncHandler(async (req, res) => {
      const now = new Date().toISOString();
      const workspaceId = newId("ws");
      db.prepare(
        `INSERT INTO workspaces (id, name, slug, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(workspaceId, req.body.name, slugify(req.body.name), req.auth!.userId, now, now);
      db.prepare(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`
      ).run(newId("member"), workspaceId, req.auth!.userId, now);

      writeAudit({ workspaceId, userId: req.auth!.userId, action: "workspace.create", targetType: "workspace", targetId: workspaceId });
      res.status(201).json({ id: workspaceId, name: req.body.name, role: "owner" });
    })
  );

  router.get("/workspaces/current", (req, res) => {
    const workspace = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.auth!.workspaceId) as any;
    if (!workspace) return res.status(404).json({ error: "not found" });
    res.json({ id: workspace.id, name: workspace.name, slug: workspace.slug, role: req.auth!.workspaceRole });
  });

  router.patch(
    "/workspaces/current",
    requireWorkspaceRole("admin"),
    validateBody(updateWorkspaceSchema),
    (req, res) => {
      db.prepare("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?").run(
        req.body.name,
        new Date().toISOString(),
        req.auth!.workspaceId
      );
      writeAudit({ workspaceId: req.auth!.workspaceId, userId: req.auth!.userId, action: "workspace.update" });
      res.json({ ok: true });
    }
  );

  router.get("/workspaces/current/members", (req, res) => {
    const rows = db
      .prepare(
        `SELECT m.id, m.role, m.created_at, u.id as user_id, u.name, u.email, u.status
         FROM workspace_members m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ? ORDER BY m.created_at ASC`
      )
      .all(req.auth!.workspaceId);
    res.json(rows);
  });

  router.patch(
    "/workspaces/current/members/:userId",
    requireWorkspaceRole("admin"),
    validateBody(updateMemberRoleSchema),
    (req, res) => {
      const member = db
        .prepare("SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
        .get(req.auth!.workspaceId, req.params.userId) as any;
      if (!member) return res.status(404).json({ error: "not found" });

      if (member.role === "owner" && req.body.role !== "owner") {
        const ownerCount = (
          db
            .prepare("SELECT COUNT(*) as n FROM workspace_members WHERE workspace_id = ? AND role = 'owner'")
            .get(req.auth!.workspaceId) as any
        ).n;
        if (ownerCount <= 1) return res.status(400).json({ error: "Cannot demote the last owner" });
      }
      if (req.body.role === "owner" && req.auth!.workspaceRole !== "owner") {
        return res.status(403).json({ error: "Only an owner can promote another member to owner" });
      }

      db.prepare("UPDATE workspace_members SET role = ? WHERE id = ?").run(req.body.role, member.id);
      writeAudit({
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        action: "workspace.member.role_change",
        targetType: "user",
        targetId: req.params.userId,
        metadata: { newRole: req.body.role },
      });
      res.json({ ok: true });
    }
  );

  router.delete("/workspaces/current/members/:userId", requireWorkspaceRole("admin"), (req, res) => {
    const member = db
      .prepare("SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
      .get(req.auth!.workspaceId, req.params.userId) as any;
    if (!member) return res.status(404).json({ error: "not found" });

    if (member.role === "owner") {
      const ownerCount = (
        db
          .prepare("SELECT COUNT(*) as n FROM workspace_members WHERE workspace_id = ? AND role = 'owner'")
          .get(req.auth!.workspaceId) as any
      ).n;
      if (ownerCount <= 1) return res.status(400).json({ error: "Cannot remove the last owner" });
    }

    db.prepare("DELETE FROM workspace_members WHERE id = ?").run(member.id);
    writeAudit({
      workspaceId: req.auth!.workspaceId,
      userId: req.auth!.userId,
      action: "workspace.member.remove",
      targetType: "user",
      targetId: req.params.userId,
    });
    res.json({ ok: true });
  });

  router.get("/workspaces/current/invites", requireWorkspaceRole("admin"), (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, email_normalized as email, role, expires_at, accepted_at, created_at
         FROM workspace_invites WHERE workspace_id = ? ORDER BY created_at DESC`
      )
      .all(req.auth!.workspaceId);
    res.json(rows);
  });

  router.post(
    "/workspaces/current/invites",
    requireWorkspaceRole("admin"),
    validateBody(inviteMemberSchema),
    asyncHandler(async (req, res) => {
      const emailNormalized = normalizeEmail(req.body.email);

      const existingUser = db.prepare("SELECT id FROM users WHERE email_normalized = ?").get(emailNormalized) as any;
      if (existingUser) {
        const alreadyMember = db
          .prepare("SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
          .get(req.auth!.workspaceId, existingUser.id);
        if (alreadyMember) return res.status(409).json({ error: "This user is already a member" });
      }

      const workspace = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(req.auth!.workspaceId) as any;
      const { token, hash } = generateToken("inv");
      const now = new Date().toISOString();
      const inviteId = newId("invite");
      db.prepare(
        `INSERT INTO workspace_invites (id, workspace_id, email_normalized, role, token_hash, invited_by_user_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        inviteId,
        req.auth!.workspaceId,
        emailNormalized,
        req.body.role,
        hash,
        req.auth!.userId,
        new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        now
      );

      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const mailResult = await sendMail({
        to: req.body.email,
        subject: `You've been invited to join ${workspace.name}`,
        text: `You've been invited to join "${workspace.name}" on Automation Platform.\n\nAccept: ${appUrl}/invite?token=${token}\n\nThis invite expires in 7 days.`,
      });

      writeAudit({
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        action: "workspace.invite.create",
        targetType: "invite",
        targetId: inviteId,
        metadata: { email: emailNormalized },
      });

      res.status(201).json({
        id: inviteId,
        email: emailNormalized,
        role: req.body.role,
        emailDelivery: mailResult,
        // Returned so the inviter can share it manually when SMTP isn't
        // configured — never silently dropped, see docs/COSTS.md.
        acceptUrl: `${appUrl}/invite?token=${token}`,
      });
    })
  );

  router.delete("/workspaces/current/invites/:id", requireWorkspaceRole("admin"), (req, res) => {
    const result = db
      .prepare("DELETE FROM workspace_invites WHERE id = ? AND workspace_id = ? AND accepted_at IS NULL")
      .run(req.params.id, req.auth!.workspaceId);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  });

  return router;
}

/** Separate from the workspace router since accepting an invite doesn't require the inviter's workspace to be the caller's active one. */
export function invitesRouter() {
  const router = Router();

  router.post(
    "/invites/accept",
    requireAuth,
    validateBody(acceptInviteSchema),
    (req, res) => {
      const hash = sha256Hex(req.body.token);
      const invite = db.prepare("SELECT * FROM workspace_invites WHERE token_hash = ?").get(hash) as any;

      if (!invite || invite.accepted_at || new Date(invite.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired invite" });
      }
      if (invite.email_normalized !== normalizeEmail(req.auth!.email)) {
        return res.status(403).json({ error: "This invite was issued to a different email address" });
      }

      const alreadyMember = db
        .prepare("SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
        .get(invite.workspace_id, req.auth!.userId);
      if (!alreadyMember) {
        db.prepare(
          `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)`
        ).run(newId("member"), invite.workspace_id, req.auth!.userId, invite.role, new Date().toISOString());
      }
      db.prepare("UPDATE workspace_invites SET accepted_at = ? WHERE id = ?").run(new Date().toISOString(), invite.id);

      const workspace = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(invite.workspace_id) as any;
      writeAudit({ workspaceId: invite.workspace_id, userId: req.auth!.userId, action: "workspace.invite.accept" });
      res.json({ ok: true, workspaceId: invite.workspace_id, workspaceName: workspace?.name });
    }
  );

  return router;
}
