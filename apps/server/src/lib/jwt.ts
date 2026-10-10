import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import type { SystemRole } from "@automation/core";

/**
 * Deliberately carries identity only, not workspace — the active workspace
 * is resolved fresh on every request from the X-Workspace-Id header (see
 * middleware/auth.ts), so a role change or workspace switch takes effect
 * immediately instead of waiting for the next login/token refresh.
 */
export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: SystemRole;
}

const ACCESS_TOKEN_TTL = "15m";

let cachedSecret: string | null = null;

export function resolveJwtSecret(): string {
  if (cachedSecret) return cachedSecret;

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    cachedSecret = process.env.JWT_SECRET;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET must be set (>= 32 chars) in production. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\""
    );
  }

  const generated = randomBytes(32).toString("base64url");
  console.warn(
    "[auth] JWT_SECRET not set — generated a random one for this process only; " +
      "every session will be invalidated on restart. Set JWT_SECRET in .env for dev convenience."
  );
  cachedSecret = generated;
  return generated;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, resolveJwtSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, resolveJwtSecret()) as AccessTokenPayload;
}
