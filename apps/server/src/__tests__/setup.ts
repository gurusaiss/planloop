import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Each test file gets an isolated in-memory DB and a scratch files root, so
// tests never touch the real dev database or the real sandboxed files dir.
process.env.DATABASE_PATH = ":memory:";
process.env.FILE_TOOL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "automation-test-"));
process.env.AI_PROVIDER = "local";
process.env.JWT_SECRET = randomBytes(32).toString("base64url");
process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.CORS_ORIGIN = "http://localhost:3000";
// Deliberately unset: SMTP_* — tests rely on the honest "not configured" path.
