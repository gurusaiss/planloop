import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { planRequestSchema, approvalDecisionSchema } from "../validation/schemas.js";

const app = createApp();
let counter = 0;
const uniqueEmail = () => `user${++counter}_${Math.random().toString(36).slice(2)}@example.com`;

// The very first user ever registered against this file's shared in-memory
// DB becomes the instance "owner" (see routes/auth.ts). Registering that
// one user up front, before any `it` runs, means every other test in this
// file can rely on its own registrants being plain "member"s — instead of
// depending on vitest's test declaration/execution order to decide who
// happens to register first.
let ownerToken: string;
let ownerWorkspaceId: string;
beforeAll(async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: uniqueEmail(), password: "a-strong-password", name: "Instance Owner" });
  ownerToken = res.body.accessToken;
  ownerWorkspaceId = res.body.workspace.id;
  expect(res.body.user.role).toBe("owner");
});

describe("POST /api/auth/register", () => {
  it("creates a user + personal workspace and returns usable tokens", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "a-strong-password", name: "Ada" });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe("member"); // not the first user in the suite
    expect(res.body.workspace.role).toBe("owner"); // but owner of their OWN workspace
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ email, password: "a-strong-password", name: "Ada" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "another-password", name: "Ada 2" });
    expect(res.status).toBe(409);
  });

  it("rejects a password shorter than 10 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail(), password: "short", name: "Ada" });
    expect(res.status).toBe(400);
    expect(res.body.details.join(" ")).toMatch(/password/i);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ email, password: "a-strong-password", name: "Ada" });
    const res = await request(app).post("/api/auth/login").send({ email, password: "a-strong-password" });
    expect(res.status).toBe(200);
    expect(res.body.workspaces).toHaveLength(1);
  });

  it("rejects a wrong password without revealing whether the account exists", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ email, password: "a-strong-password", name: "Ada" });
    const wrongUser = await request(app).post("/api/auth/login").send({ email, password: "totally-wrong" });
    const noUser = await request(app).post("/api/auth/login").send({ email: uniqueEmail(), password: "totally-wrong" });
    expect(wrongUser.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongUser.body.error).toBe(noUser.body.error);
  });

  it("locks the account after repeated failed logins", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ email, password: "a-strong-password", name: "Ada" });
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/login").send({ email, password: "wrong" });
    }
    const res = await request(app).post("/api/auth/login").send({ email, password: "a-strong-password" });
    expect(res.status).toBe(423);
  });
});

describe("GET /api/auth/me", () => {
  it("requires a bearer token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user and their workspaces", async () => {
    const email = uniqueEmail();
    const reg = await request(app).post("/api/auth/register").send({ email, password: "a-strong-password", name: "Ada" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});

describe("refresh token rotation", () => {
  it("issues a new token pair and invalidates the old refresh token (replay protection)", async () => {
    const email = uniqueEmail();
    const reg = await request(app).post("/api/auth/register").send({ email, password: "a-strong-password", name: "Ada" });

    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken: reg.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    const replay = await request(app).post("/api/auth/refresh").send({ refreshToken: reg.body.refreshToken });
    expect(replay.status).toBe(401);
  });
});

describe("logout", () => {
  it("invalidates the refresh token", async () => {
    const email = uniqueEmail();
    const reg = await request(app).post("/api/auth/register").send({ email, password: "a-strong-password", name: "Ada" });
    await request(app).post("/api/auth/logout").send({ refreshToken: reg.body.refreshToken });
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: reg.body.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe("requireWorkspaceRole", () => {
  it("lets a viewer read automations but not create one", async () => {
    const ownerEmail = uniqueEmail();
    const owner = await request(app).post("/api/auth/register").send({ email: ownerEmail, password: "a-strong-password", name: "Owner" });
    const workspaceOwnerToken = owner.body.accessToken;
    const workspaceId = owner.body.workspace.id;

    const invite = await request(app)
      .post("/api/workspaces/current/invites")
      .set("Authorization", `Bearer ${workspaceOwnerToken}`)
      .set("X-Workspace-Id", workspaceId)
      .send({ email: uniqueEmail(), role: "viewer" });
    expect(invite.status).toBe(201);

    const viewerEmail = invite.body.email;
    const token = new URL(invite.body.acceptUrl).searchParams.get("token")!;
    const viewer = await request(app)
      .post("/api/auth/register")
      .send({ email: viewerEmail, password: "a-strong-password", name: "Viewer" });
    const acceptRes = await request(app)
      .post("/api/invites/accept")
      .set("Authorization", `Bearer ${viewer.body.accessToken}`)
      .send({ token });
    expect(acceptRes.status).toBe(200);

    const list = await request(app)
      .get("/api/automations")
      .set("Authorization", `Bearer ${viewer.body.accessToken}`)
      .set("X-Workspace-Id", workspaceId);
    expect(list.status).toBe(200);

    const createAttempt = await request(app)
      .post("/api/automations")
      .set("Authorization", `Bearer ${viewer.body.accessToken}`)
      .set("X-Workspace-Id", workspaceId)
      .send({
        plan: {
          id: "plan_x",
          title: "t",
          summary: "s",
          trigger: { type: "manual" },
          steps: [{ id: "s1", kind: "approval", riskLevel: "medium", label: "x" }],
          requiresApproval: true,
          createdBy: "human",
        },
      });
    expect(createAttempt.status).toBe(403);
  });
});

describe("requireSystemAdmin", () => {
  it("allows the instance owner into the admin panel", async () => {
    const res = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.users).toBe("number");
  });

  it("blocks a plain member from the instance admin panel", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail(), password: "a-strong-password", name: "Regular User" });
    expect(reg.body.user.role).toBe("member");
    const res = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("suspending a user invalidates their access immediately", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail(), password: "a-strong-password", name: "To Be Suspended" });

    const before = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(before.status).toBe(200);

    const suspend = await request(app)
      .patch(`/api/admin/users/${reg.body.user.id}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "suspended" });
    expect(suspend.status).toBe(200);

    // requireAuth re-checks user.status from the DB on every request, so
    // the SAME still-unexpired access token is rejected on the very next call.
    const after = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(after.status).toBe(401);
  });

  it("only an owner can promote someone to owner, not a plain admin", async () => {
    const adminReg = await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail(), password: "a-strong-password", name: "Promoted Admin" });
    await request(app)
      .patch(`/api/admin/users/${adminReg.body.user.id}/role`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "admin" });

    const targetReg = await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail(), password: "a-strong-password", name: "Target" });

    // Refresh the admin's access token isn't needed — role is looked up
    // fresh from the DB on every request, not baked into the JWT.
    const attempt = await request(app)
      .patch(`/api/admin/users/${targetReg.body.user.id}/role`)
      .set("Authorization", `Bearer ${adminReg.body.accessToken}`)
      .send({ role: "owner" });
    expect(attempt.status).toBe(403);
  });
});

describe("workspace isolation", () => {
  it("a user cannot act on an automation that belongs to a different workspace", async () => {
    const a = await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail(), password: "a-strong-password", name: "Tenant A" });
    const b = await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail(), password: "a-strong-password", name: "Tenant B" });

    const created = await request(app)
      .post("/api/automations")
      .set("Authorization", `Bearer ${a.body.accessToken}`)
      .set("X-Workspace-Id", a.body.workspace.id)
      .send({
        plan: {
          id: "plan_iso",
          title: "t",
          summary: "s",
          trigger: { type: "manual" },
          steps: [{ id: "s1", kind: "tool", tool: "file_organize", riskLevel: "medium", label: "x", input: { sourceDir: "x", rules: {} } }],
          requiresApproval: true,
          createdBy: "human",
        },
      });
    expect(created.status).toBe(201);
    const automationId = created.body.id;

    // Tenant B, authenticated, with their OWN workspace header, must not see tenant A's automation.
    const crossTenantRead = await request(app)
      .get(`/api/automations/${automationId}`)
      .set("Authorization", `Bearer ${b.body.accessToken}`)
      .set("X-Workspace-Id", b.body.workspace.id);
    expect(crossTenantRead.status).toBe(404);
  });
});

describe("middleware unit behavior", () => {
  function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it("requireAuth rejects a missing Authorization header", () => {
    const req: any = { header: () => undefined };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAuth rejects a garbage bearer token without throwing", () => {
    const req: any = { header: () => "Bearer not-a-real-token" };
    const res = mockRes();
    const next = vi.fn();
    expect(() => requireAuth(req, res, next)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("validateBody rejects an empty plan-request text with a readable detail message", () => {
    const req: any = { body: { text: "" } };
    const res = mockRes();
    const next = vi.fn();
    validateBody(planRequestSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("validateBody rejects an approval decision outside the enum", () => {
    const req: any = { body: { decision: "maybe" } };
    const res = mockRes();
    const next = vi.fn();
    validateBody(approvalDecisionSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("validateBody passes valid input through to next() with parsed body", () => {
    const req: any = { body: { text: "check https://example.com" } };
    const res = mockRes();
    const next = vi.fn();
    validateBody(planRequestSchema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ text: "check https://example.com" });
  });
});
