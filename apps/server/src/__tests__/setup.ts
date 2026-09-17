import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Each test file gets an isolated in-memory DB and a scratch files root, so
// tests never touch the real dev database or the real sandboxed files dir.
process.env.DATABASE_PATH = ":memory:";
process.env.FILE_TOOL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "automation-test-"));
process.env.AI_PROVIDER = "local";
