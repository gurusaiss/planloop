import type { NextFunction, Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Single-user bearer-token auth for the MVP (see docs/SECURITY.md — a real
 * multi-user login is out of scope until multi-tenancy lands, but "no auth
 * at all" was flagged there as a hard blocker for anything beyond a
 * developer's own machine, so this closes that gap now).
 *
 * The token is generated once at startup if ADMIN_TOKEN isn't set, and
 * printed to the server log — it is never written to disk or returned by
 * any API response.
 */
export function resolveAdminToken(): string {
  if (process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length >= 16) {
    return process.env.ADMIN_TOKEN;
  }
  if (process.env.NODE_ENV === "production") {
    // A random per-process token is fine for local/dev convenience, but in
    // production it would silently rotate on every restart/redeploy —
    // locking out whatever client held the old one with no warning to the
    // operator until requests start failing. Fail loudly at boot instead.
    throw new Error(
      "ADMIN_TOKEN must be set (>= 16 chars) when NODE_ENV=production. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(24).toString('base64url'))\""
    );
  }
  const generated = randomBytes(24).toString("base64url");
  console.warn(
    "[auth] ADMIN_TOKEN not set (or too short) — generated a random token for this process only.\n" +
      "        Set ADMIN_TOKEN in your .env for a token that survives restarts.\n" +
      `        Generated token: ${generated}`
  );
  return generated;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireAuth(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!provided || !safeEqual(provided, token)) {
      return res.status(401).json({ error: "Unauthorized — missing or invalid bearer token" });
    }
    next();
  };
}
