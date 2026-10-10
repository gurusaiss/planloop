import type { LlmProvider, ToolDefinition } from "@automation/core";
import { httpFetchTool } from "./httpFetch.js";
import { createSummarizeTool } from "./summarize.js";
import { fileOrganizeTool } from "./fileOrganize.js";
import { notifyTool } from "./notify.js";
import { browserSnapshotTool } from "./browserSnapshot.js";
import { diffSnapshotTool } from "./diffSnapshot.js";

/**
 * The tool registry is the platform's extensibility seam: a new capability
 * is added by writing one ToolDefinition and registering it here — nothing
 * else (planner, workflow engine, routes, UI) needs to change. All tools
 * are stateless; workspace/automation scoping comes from ToolContext at
 * call time, not from closures captured at registry-build time.
 */
export function buildToolRegistry(provider: LlmProvider): Map<string, ToolDefinition> {
  const tools: ToolDefinition[] = [
    httpFetchTool,
    browserSnapshotTool,
    createSummarizeTool(provider),
    diffSnapshotTool,
    fileOrganizeTool,
    notifyTool,
  ];
  return new Map(tools.map((t) => [t.name, t]));
}
