import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db, newId, normalizeEmail, slugify } from "../db/index.js";
import { hashPassword, verifyPassword, generateToken, sha256Hex } from "../lib/crypto.js";
import { signAccessToken } from "../lib/jwt.js";
import { sendMail } from "../lib/mailer.js";
import { writeAudit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} from "../validation/schemas.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, slow down." },
});

export function authRouter() {
  const router = Router();

  router.post(
    "/auth/register",
    validateBody(registerSchema),
    asyncHandler(async (req, res) => {
      const { email, password, name } = req.body;
      const emailNormalized = normalizeEmail(email);

      const existing = db.prepare("SELECT id FROM users WHERE email_normalized = ?").get(emailNormalized);
      if (existing) return res.status(409).json({ error: "An account with this email already exists" });

      const isFirstUser = (db.prepare("SELECT COUNT(*) as n FROM users").get() as any).n === 0;
      const now = new Date().toISOString();
      const userId = newId("user");
      const passwordHash = await hashPassword(password);

      db.prepare(
        `INSERT INTO users (id, email, email_normalized, password_hash, name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      ).run(userId, email, emailNormalized, passwordHash, name, isFirstUser ? "owner" : "member", now, now);

      const workspaceId = newId("ws");
      const workspaceName = `${name}'s Workspace`;
      db.prepare(
        `INSERT INTO workspaces (id, name, slug, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(workspaceId, workspaceName, slugify(workspaceName), userId, now, now);

      db.prepare(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`
      ).run(newId("member"), workspaceId, userId, now);

      writeAudit({ workspaceId, userId, action: "user.register", targetType: "user", targetId: userId, ip: req.ip });

      const { accessToken, refreshToken } = issueSession(userId, email, isFirstUser ? "owner" : "member", req);

      res.status(201).json({
        accessToken,
        refreshToken,
        user: publicUser({ id: userId, email, name, role: isFirstUser ? "owner" : "member", status: "active" }),
        workspace: { id: workspaceId, name: workspaceName, role: "owner" },
      });
    })
  );

  router.post(
    "/auth/login",
    loginLimiter,
    validateBody(loginSchema),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      const emailNormalized = normalizeEmail(email);
      const user = db.prepare("SELECT * FROM users WHERE email_normalized = ?").get(emailNormalized) as any;

      // Always run a password hash even on a missing user, so response
      // timing doesn't reveal whether the email exists.
      const decoyHash = "scrypt:16384:8:1:00:00";
      const passwordOk = await verifyPassword(password, user?.password_hash ?? decoyHash);

      if (!user) return res.status(401).json({ error: "Invalid email or password" });

      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        return res.status(423).json({ error: "Account temporarily locked due to repeated failed logins. Try again later." });
      }
      if (user.status !== "active") {
        return res.status(403).json({ error: "This account has been suspended." });
      }

      if (!passwordOk) {
        const failedCount = user.failed_login_count + 1;
        const lockedUntil =
          failedCount >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
        db.prepare("UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?").run(
          failedCount,
          lockedUntil,
          user.id
        );
        return res.status(401).json({ error: "Invalid email or password" });
      }

      db.prepare(
        "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?"
      ).run(new Date().toISOString(), user.id);

      writeAudit({ userId: user.id, action: "user.login", targetType: "user", targetId: user.id, ip: req.ip });

      const { accessToken, refreshToken } = issueSession(user.id, user.email, user.role, req);
      const workspaces = listMemberships(user.id);

      res.json({ accessToken, refreshToken, user: publicUser(user), workspaces });
    })
  );

  router.post(
    "/auth/refresh",
    validateBody(refreshSchema),
    asyncHandler(async (req, res) => {
      const hash = sha256Hex(req.body.refreshToken);
      const session = db.prepare("SELECT * FROM sessions WHERE refresh_token_hash = ?").get(hash) as any;

      if (!session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now()) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as any;
      if (!user || user.status !== "active") {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      // Rotate: revoke the used token and issue a fresh one, so a stolen
      // refresh token can only be replayed once before this detects reuse.
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), session.id);

      const { accessToken, refreshToken } = issueSession(user.id, user.email, user.role, req);
      res.json({ accessToken, refreshToken });
    })
  );

  router.post(
    "/auth/logout",
    validateBody(refreshSchema),
    asyncHandler(async (req, res) => {
      const hash = sha256Hex(req.body.refreshToken);
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND revoked_at IS NULL").run(
        new Date().toISOString(),
        hash
      );
      res.json({ ok: true });
    })
  );

  router.post(
    "/auth/logout-all",
    requireAuth,
    asyncHandler(async (req, res) => {
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(
        new Date().toISOString(),
        req.auth!.userId
      );
      writeAudit({ userId: req.auth!.userId, action: "user.logout_all", ip: req.ip });
      res.json({ ok: true });
    })
  );

  router.get(
    "/auth/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth!.userId) as any;
      if (!user) return res.status(404).json({ error: "not found" });
      res.json({ user: publicUser(user), workspaces: listMemberships(user.id), activeWorkspaceId: req.auth!.workspaceId });
    })
  );

  router.patch(
    "/auth/me",
    requireAuth,
    validateBody(updateProfileSchema),
    asyncHandler(async (req, res) => {
      if (req.body.name) {
        db.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").run(
          req.body.name,
          new Date().toISOString(),
          req.auth!.userId
        );
      }
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth!.userId) as any;
      res.json({ user: publicUser(user) });
    })
  );

  router.post(
    "/auth/change-password",
    requireAuth,
    validateBody(changePasswordSchema),
    asyncHandler(async (req, res) => {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth!.userId) as any;
      const ok = await verifyPassword(req.body.currentPassword, user.password_hash);
      if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

      const newHash = await hashPassword(req.body.newPassword);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
        newHash,
        new Date().toISOString(),
        user.id
      );
      // Force re-login everywhere — a changed password should invalidate
      // every existing session, not just the one that changed it.
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(
        new Date().toISOString(),
        user.id
      );
      writeAudit({ userId: user.id, action: "user.change_password", ip: req.ip });
      res.json({ ok: true });
    })
  );

  router.post(
    "/auth/request-password-reset",
    loginLimiter,
    validateBody(requestPasswordResetSchema),
    asyncHandler(async (req, res) => {
      const user = db
        .prepare("SELECT * FROM users WHERE email_normalized = ?")
        .get(normalizeEmail(req.body.email)) as any;

      // Always 200 — never reveal whether an account exists for this email.
      if (user) {
        const { token, hash } = generateToken("prt");
        db.prepare(
          `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(newId("prt"), user.id, hash, new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(), new Date().toISOString());

        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const result = await sendMail({
          to: user.email,
          subject: "Reset your password",
          text: `Reset your password: ${appUrl}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
        });
        if (!result.delivered) {
          console.warn(`[auth] password reset email not sent (${result.detail}). Token (dev only): ${token}`);
        }
      }

      res.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
    })
  );

  router.post(
    "/auth/reset-password",
    validateBody(resetPasswordSchema),
    asyncHandler(async (req, res) => {
      const hash = sha256Hex(req.body.token);
      const row = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?").get(hash) as any;

      if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      const newHash = await hashPassword(req.body.newPassword);
      const now = new Date().toISOString();
      db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(newHash, now, row.user_id);
      db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(now, row.id);
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, row.user_id);

      writeAudit({ userId: row.user_id, action: "user.reset_password", ip: req.ip });
      res.json({ ok: true });
    })
  );

  return router;
}

function issueSession(userId: string, email: string, role: string, req: { ip?: string; header: (k: string) => string | undefined }) {
  const accessToken = signAccessToken({ sub: userId, email, role: role as any });
  const { token: refreshToken, hash } = generateToken("rt");
  const now = new Date();
  db.prepare(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip, expires_at, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId("sess"),
    userId,
    hash,
    req.header("user-agent") ?? null,
    req.ip ?? null,
    new Date(now.getTime() + REFRESH_TOKEN_TTL_MS).toISOString(),
    now.toISOString(),
    now.toISOString()
  );
  return { accessToken, refreshToken };
}

function listMemberships(userId: string) {
  return db
    .prepare(
      `SELECT w.id, w.name, w.slug, m.role
       FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ? ORDER BY m.created_at ASC`
    )
    .all(userId);
}

function publicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
  };
}
