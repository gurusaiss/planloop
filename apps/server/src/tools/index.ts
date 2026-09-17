import type { LlmProvider, ToolDefinition } from "@automation/core";
import { httpFetchTool } from "./httpFetch.js";
import { createSummarizeTool } from "./summarize.js";
import { fileOrganizeTool } from "./fileOrganize.js";
import { createNotifyTool } from "./notify.js";
import { browserSnapshotTool } from "./browserSnapshot.js";
import { diffSnapshotTool } from "./diffSnapshot.js";

/**
 * The tool registry is the platform's extensibility seam: a new capability
 * is added by writing one ToolDefinition and registering it here — nothing
 * else (planner, workflow engine, routes, UI) needs to change.
 */
export function buildToolRegistry(provider: LlmProvider, workspaceId: string): Map<string, ToolDefinition> {
  const tools: ToolDefinition[] = [
    httpFetchTool,
    browserSnapshotTool,
    createSummarizeTool(provider),
    diffSnapshotTool,
    fileOrganizeTool,
    createNotifyTool(workspaceId),
  ];
  return new Map(tools.map((t) => [t.name, t]));
}
