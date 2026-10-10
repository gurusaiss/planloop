import nodemailer from "nodemailer";

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendMailResult {
  delivered: boolean;
  detail: string;
}

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport(): ReturnType<typeof nodemailer.createTransport> {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransport;
}

/**
 * The one real email send path in the app — used by auth (password reset,
 * workspace invites) and by the `notify` tool alike. If SMTP isn't
 * configured this honestly reports that instead of pretending to deliver
 * anything (see docs/TOOLS.md and docs/COSTS.md) — the caller is
 * responsible for recording the content somewhere durable (a notification
 * row) regardless of delivery outcome.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!isSmtpConfigured()) {
    return { delivered: false, detail: "SMTP not configured — no email was sent; see .env.example." };
  }
  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { delivered: true, detail: `Sent via SMTP to ${input.to}` };
  } catch (err: any) {
    return { delivered: false, detail: `SMTP send failed: ${err?.message ?? String(err)}` };
  }
}
