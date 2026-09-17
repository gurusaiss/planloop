import type { ToolDefinition } from "@automation/core";
import { db, newId } from "../db/index.js";

interface Input {
  key: string; // typically the monitored URL
  content: string;
}
interface Output {
  changed: boolean;
  previous: string | null;
  current: string;
}

/**
 * Stores the latest content snapshot per (automation, key) and reports
 * whether it changed since the previous run — this is the "verification"
 * step for website-monitoring workflows: the AI doesn't just re-summarize
 * every run, the system deterministically checks whether anything changed.
 *
 * automationId comes from the runtime ToolContext, not from planner-supplied
 * input: the planner builds a plan before the plan is ever activated as an
 * automation, so it cannot know the automation's id yet.
 */
export const diffSnapshotTool: ToolDefinition<Input, Output> = {
  name: "diff_snapshot",
  description: "Compare content against the last stored snapshot for this automation and report whether it changed.",
  riskLevel: "low",
  inputSchema: {
    type: "object",
    required: ["key", "content"],
    properties: {
      key: { type: "string" },
      content: { type: "string" },
    },
  },
  async run(input, ctx) {
    const row = db
      .prepare("SELECT content FROM artifacts WHERE automation_id = ? AND key = ?")
      .get(ctx.automationId, input.key) as { content: string } | undefined;

    const previous = row?.content ?? null;
    const changed = previous !== input.content;

    db.prepare(
      `INSERT INTO artifacts (id, workspace_id, automation_id, key, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(automation_id, key) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`
    ).run(newId("artifact"), ctx.workspaceId, ctx.automationId, input.key, input.content, new Date().toISOString());

    return { changed, previous, current: input.content };
  },
};
