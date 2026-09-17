import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DATABASE_PATH ?? "./data/app.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Bootstrap the single default workspace used by the MVP.
export const DEFAULT_WORKSPACE_ID = "ws_default";
const existing = db
  .prepare("SELECT id FROM workspaces WHERE id = ?")
  .get(DEFAULT_WORKSPACE_ID);
if (!existing) {
  db.prepare(
    "INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)"
  ).run(DEFAULT_WORKSPACE_ID, "Default Workspace", new Date().toISOString());
}

export function newId(prefix: string): string {
  return `${prefix}_${uuid()}`;
}
