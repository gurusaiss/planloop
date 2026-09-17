import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { httpFetchTool } from "../tools/httpFetch.js";
import { fileOrganizeTool } from "../tools/fileOrganize.js";
import { diffSnapshotTool } from "../tools/diffSnapshot.js";
import { db } from "../db/index.js";

function ensureAutomation(id: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO automations (id, workspace_id, title, summary, plan_json, status, created_by, requires_approval, cron, created_at, updated_at)
     VALUES (?, 'ws_default', 't', 's', '{}', 'active', 'ai', 0, NULL, ?, ?)`
  ).run(id, now, now);
}

const ctx = (over: Partial<Parameters<typeof diffSnapshotTool.run>[1]> = {}) => ({
  workspaceId: "ws_default",
  automationId: "auto_test",
  runId: "run_test",
  stepId: "step_test",
  credentials: {},
  ...over,
});

describe("httpFetchTool", () => {
  it("refuses to fetch loopback/internal hosts (SSRF guard)", async () => {
    await expect(httpFetchTool.run({ url: "http://localhost:1234/" }, ctx())).rejects.toThrow(
      /not allowed/i
    );
  });

  it("refuses non-http(s) protocols", async () => {
    await expect(httpFetchTool.run({ url: "file:///etc/passwd" }, ctx())).rejects.toThrow();
  });
});

describe("fileOrganizeTool", () => {
  it("refuses to touch paths outside the sandboxed files root", async () => {
    await expect(
      fileOrganizeTool.run({ sourceDir: "../../../etc", rules: { x: ["pdf"] } }, ctx())
    ).rejects.toThrow(/sandboxed files root/i);
  });

  it("moves files into rule-matched subfolders", async () => {
    const root = process.env.FILE_TOOL_ROOT!;
    const dir = path.join(root, "case1");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "a.pdf"), "x");
    await fs.writeFile(path.join(dir, "b.png"), "x");

    const result = await fileOrganizeTool.run(
      { sourceDir: "case1", rules: { documents: ["pdf"], images: ["png"] } },
      ctx()
    );

    expect(result.moved).toHaveLength(2);
    await expect(fs.access(path.join(dir, "documents", "a.pdf"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, "images", "b.png"))).resolves.toBeUndefined();
  });

  it("dryRun leaves files untouched", async () => {
    const root = process.env.FILE_TOOL_ROOT!;
    const dir = path.join(root, "case2");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "a.pdf"), "x");

    await fileOrganizeTool.run({ sourceDir: "case2", rules: { documents: ["pdf"] }, dryRun: true }, ctx());

    await expect(fs.access(path.join(dir, "a.pdf"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, "documents", "a.pdf"))).rejects.toThrow();
  });
});

describe("diffSnapshotTool", () => {
  it("reports changed=true on first run and false on an identical second run", async () => {
    ensureAutomation("auto_diff_test");
    const c = ctx({ automationId: "auto_diff_test" });
    const first = await diffSnapshotTool.run({ key: "https://x.example", content: "hello" }, c);
    expect(first.changed).toBe(true);
    expect(first.previous).toBeNull();

    const second = await diffSnapshotTool.run({ key: "https://x.example", content: "hello" }, c);
    expect(second.changed).toBe(false);

    const third = await diffSnapshotTool.run({ key: "https://x.example", content: "hello v2" }, c);
    expect(third.changed).toBe(true);
    expect(third.previous).toBe("hello");
  });

  it("keeps snapshots isolated per automation (tenant isolation for artifacts)", async () => {
    ensureAutomation("auto_A");
    ensureAutomation("auto_B");
    await diffSnapshotTool.run({ key: "shared-key", content: "A's content" }, ctx({ automationId: "auto_A" }));
    const b = await diffSnapshotTool.run({ key: "shared-key", content: "B's content" }, ctx({ automationId: "auto_B" }));
    expect(b.previous).toBeNull(); // automation B never sees automation A's snapshot
  });
});
