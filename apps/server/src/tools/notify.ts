import type { ToolDefinition } from "@automation/core";
import { db, newId } from "../db/index.js";

interface Input {
  subject: string;
  body: string;
}
interface Output {
  channel: "email" | "log";
  delivered: boolean;
  detail: string;
}

/**
 * Sends a notification. If SMTP env vars are configured, a real email tool
 * can be swapped in later behind this same interface. For zero-cost local
 * development there is no SMTP account available, so this tool honestly
 * records the notification to the database/notifications log instead of
 * pretending to send an email — see docs/TOOLS.md.
 */
export function createNotifyTool(workspaceId: string): ToolDefinition<Input, Output> {
  return {
    name: "notify",
    description: "Deliver a notification to the user (email if configured, otherwise a local notification log).",
    riskLevel: "high", // treated as an external, user-visible action
    inputSchema: {
      type: "object",
      required: ["subject", "body"],
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
      },
    },
    async run(input) {
      const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.NOTIFY_EMAIL_TO);
      const channel = smtpConfigured ? "email" : "log";

      db.prepare(
        `INSERT INTO notifications (id, workspace_id, channel, subject, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(newId("notif"), workspaceId, channel, input.subject, input.body, new Date().toISOString());

      if (smtpConfigured) {
        // Real SMTP delivery intentionally not wired up in the MVP (no
        // credentials available in a zero-cost dev environment). Flagged
        // clearly here rather than faked.
        return {
          channel,
          delivered: false,
          detail: "SMTP configured but delivery not implemented in MVP; recorded to notifications log.",
        };
      }

      return {
        channel,
        delivered: true,
        detail: "Recorded to local notifications log (no SMTP configured).",
      };
    },
  };
}
