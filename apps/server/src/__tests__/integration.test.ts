import { describe, it, expect } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import { createApp } from "../app.js";

const app = createApp();
let counter = 0;
const uniqueEmail = () => `e2e${++counter}_${Math.random().toString(36).slice(2)}@example.com`;

async function registerAndAuth() {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: uniqueEmail(), password: "a-strong-password", name: "E2E User" });
  return {
    token: res.body.accessToken as string,
    workspaceId: res.body.workspace.id as string,
  };
}

function authed(req: request.Test, token: string, workspaceId: string) {
  return req.set("Authorization", `Bearer ${token}`).set("X-Workspace-Id", workspaceId);
}

describe("full core loop: describe -> plan -> activate -> run -> approve -> result", () => {
  it("runs the file-organize template end to end through the real HTTP API", async () => {
    const { token, workspaceId } = await registerAndAuth();

    // Put real files where the sandboxed file_organize tool will look for them.
    const root = process.env.FILE_TOOL_ROOT!;
    const dir = path.join(root, "e2e-inbox");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "report.pdf"), "x");
    await fs.writeFile(path.join(dir, "photo.png"), "x");

    // STEP 1: describe -> plan.
    const planRes = await authed(request(app).post("/api/plan"), token, workspaceId).send({
      text: "organize files in folder e2e-inbox",
    });
    expect(planRes.status).toBe(200);
    expect(planRes.body.plan.requiresApproval).toBe(true); // file_organize is medium risk

    // STEP 2: activate.
    const createRes = await authed(request(app).post("/api/automations"), token, workspaceId).send({
      plan: planRes.body.plan,
    });
    expect(createRes.status).toBe(201);
    const automationId = createRes.body.id;

    // STEP 3: run now -> pauses for approval (medium risk).
    const runRes = await authed(request(app).post(`/api/automations/${automationId}/run`), token, workspaceId);
    expect(runRes.status).toBe(202);
    const runId = runRes.body.runId;

    await new Promise((r) => setTimeout(r, 200)); // let the async engine reach the approval gate

    const detail1 = await authed(request(app).get(`/api/runs/${runId}`), token, workspaceId);
    expect(detail1.body.run.status).toBe("pending_approval");
    const approval = detail1.body.approvals.find((a: any) => a.status === "pending");
    expect(approval).toBeDefined();

    // Files must be untouched while waiting for approval.
    await expect(fs.access(path.join(dir, "report.pdf"))).resolves.toBeUndefined();

    // STEP 4: approve -> resumes and completes.
    const approveRes = await authed(
      request(app).post(`/api/runs/${runId}/approvals/${approval.id}`),
      token,
      workspaceId
    ).send({ decision: "approved" });
    expect(approveRes.status).toBe(200);

    await new Promise((r) => setTimeout(r, 200));

    const detail2 = await authed(request(app).get(`/api/runs/${runId}`), token, workspaceId);
    expect(detail2.body.run.status).toBe("succeeded");

    // STEP 5: verify the real side effect actually happened.
    await expect(fs.access(path.join(dir, "documents", "report.pdf"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, "images", "photo.png"))).resolves.toBeUndefined();
  });

  it("rejecting the approval cancels the run and leaves files untouched", async () => {
    const { token, workspaceId } = await registerAndAuth();
    const root = process.env.FILE_TOOL_ROOT!;
    const dir = path.join(root, "e2e-reject");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "a.pdf"), "x");

    const planRes = await authed(request(app).post("/api/plan"), token, workspaceId).send({
      text: "organize files in folder e2e-reject",
    });
    const createRes = await authed(request(app).post("/api/automations"), token, workspaceId).send({
      plan: planRes.body.plan,
    });
    const runRes = await authed(request(app).post(`/api/automations/${createRes.body.id}/run`), token, workspaceId);
    const runId = runRes.body.runId;

    await new Promise((r) => setTimeout(r, 200));
    const detail = await authed(request(app).get(`/api/runs/${runId}`), token, workspaceId);
    const approval = detail.body.approvals.find((a: any) => a.status === "pending");

    const rejectRes = await authed(
      request(app).post(`/api/runs/${runId}/approvals/${approval.id}`),
      token,
      workspaceId
    ).send({ decision: "rejected" });
    expect(rejectRes.status).toBe(200);

    const final = await authed(request(app).get(`/api/runs/${runId}`), token, workspaceId);
    expect(final.body.run.status).toBe("cancelled");
    await expect(fs.access(path.join(dir, "a.pdf"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, "documents"))).rejects.toThrow();
  });

  it("a second identical approval decision is rejected (idempotency)", async () => {
    const { token, workspaceId } = await registerAndAuth();
    const root = process.env.FILE_TOOL_ROOT!;
    await fs.mkdir(path.join(root, "e2e-idem"), { recursive: true });

    const planRes = await authed(request(app).post("/api/plan"), token, workspaceId).send({
      text: "organize files in folder e2e-idem",
    });
    const createRes = await authed(request(app).post("/api/automations"), token, workspaceId).send({
      plan: planRes.body.plan,
    });
    const runRes = await authed(request(app).post(`/api/automations/${createRes.body.id}/run`), token, workspaceId);
    await new Promise((r) => setTimeout(r, 200));
    const detail = await authed(request(app).get(`/api/runs/${runRes.body.runId}`), token, workspaceId);
    const approval = detail.body.approvals.find((a: any) => a.status === "pending");

    const first = await authed(
      request(app).post(`/api/runs/${runRes.body.runId}/approvals/${approval.id}`),
      token,
      workspaceId
    ).send({ decision: "approved" });
    expect(first.status).toBe(200);

    const second = await authed(
      request(app).post(`/api/runs/${runRes.body.runId}/approvals/${approval.id}`),
      token,
      workspaceId
    ).send({ decision: "rejected" });
    expect(second.status).toBe(409);
  });
});
