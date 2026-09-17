import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "@automation/core";

interface Input {
  sourceDir: string;
  /** Map of destination subfolder -> file extensions, e.g. { images: ["png","jpg"] } */
  rules: Record<string, string[]>;
  dryRun?: boolean;
}
interface Output {
  moved: { file: string; to: string }[];
  dryRun: boolean;
}

const WORKSPACE_ROOT = path.resolve(process.env.FILE_TOOL_ROOT ?? "./data/files");

function assertWithinRoot(target: string) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(
      `Refusing to touch path outside the sandboxed files root (${WORKSPACE_ROOT}): ${resolved}`
    );
  }
  return resolved;
}

export const fileOrganizeTool: ToolDefinition<Input, Output> = {
  name: "file_organize",
  description:
    "Organize files inside the sandboxed workspace files directory into subfolders by extension rule.",
  riskLevel: "medium", // moves files; not destructive but changes state
  inputSchema: {
    type: "object",
    required: ["sourceDir", "rules"],
    properties: {
      sourceDir: { type: "string" },
      rules: { type: "object" },
      dryRun: { type: "boolean" },
    },
  },
  async run(input) {
    const sourceDir = assertWithinRoot(path.join(WORKSPACE_ROOT, input.sourceDir));
    await fs.mkdir(sourceDir, { recursive: true });
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    const moved: { file: string; to: string }[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).replace(".", "").toLowerCase();
      const destFolder = Object.entries(input.rules).find(([, exts]) =>
        exts.map((e) => e.toLowerCase()).includes(ext)
      )?.[0];
      if (!destFolder) continue;

      const destDir = assertWithinRoot(path.join(sourceDir, destFolder));
      const from = path.join(sourceDir, entry.name);
      const to = path.join(destDir, entry.name);

      if (!input.dryRun) {
        await fs.mkdir(destDir, { recursive: true });
        await fs.rename(from, to);
      }
      moved.push({ file: entry.name, to: path.relative(WORKSPACE_ROOT, to) });
    }

    return { moved, dryRun: Boolean(input.dryRun) };
  },
};
