import type { ToolDefinition } from "@automation/core";
import { db, newId } from "../db/index.js";
import { sendMail } from "../lib/mailer.js";

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
 * Sends a notification to the user who created the automation. If SMTP is
 * configured (see lib/mailer.ts), this sends a real email; either way the
 * notification is always recorded to the notifications table so it shows
 * up in the app regardless of email delivery — see docs/TOOLS.md.
 */
export const notifyTool: ToolDefinition<Input, Output> = {
  name: "notify",
  description: "Notify the automation's owner (email if SMTP is configured, always recorded in-app).",
  riskLevel: "high", // treated as an external, user-visible action
  inputSchema: {
    type: "object",
    required: ["subject", "body"],
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
    },
  },
  async run(input, ctx) {
    const automation = db
      .prepare("SELECT created_by_user_id FROM automations WHERE id = ?")
      .get(ctx.automationId) as { created_by_user_id: string } | undefined;
    const recipient = automation
      ? (db.prepare("SELECT email FROM users WHERE id = ?").get(automation.created_by_user_id) as
          | { email: string }
          | undefined)
      : undefined;

    const mailResult = recipient
      ? await sendMail({ to: recipient.email, subject: input.subject, text: input.body })
      : { delivered: false, detail: "No recipient on file for this automation." };

    db.prepare(
      `INSERT INTO notifications (id, workspace_id, user_id, run_id, channel, subject, body, delivered, delivery_error, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId("notif"),
      ctx.workspaceId,
      automation?.created_by_user_id ?? null,
      mailResult.delivered ? "email" : "log",
      input.subject,
      input.body,
      mailResult.delivered ? 1 : 0,
      mailResult.delivered ? null : mailResult.detail,
      new Date().toISOString()
    );

    return { channel: mailResult.delivered ? "email" : "log", delivered: mailResult.delivered, detail: mailResult.detail };
  },
};
