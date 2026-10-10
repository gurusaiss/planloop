import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.js";
import { workspacesRouter, invitesRouter } from "./routes/workspaces.js";
import { apiKeysRouter } from "./routes/apiKeys.js";
import { providerConfigsRouter } from "./routes/providerConfigs.js";
import { adminRouter } from "./routes/admin.js";
import { automationsRouter } from "./routes/automations.js";
import { runsRouter } from "./routes/runs.js";
import { notificationsRouter } from "./routes/notifications.js";

/**
 * Builds the Express app with no side effects (no listen, no scheduler, no
 * process-level env validation) — used by both the real server entrypoint
 * (index.ts) and integration tests (supertest against this directly).
 */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());

  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  const planLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", authRouter());
  app.use("/api", workspacesRouter());
  app.use("/api", invitesRouter());
  app.use("/api", apiKeysRouter());
  app.use("/api", providerConfigsRouter());
  // Mounted at its own prefix, not bare "/api" — adminRouter's
  // requireSystemAdmin is a router-level (unscoped-path) middleware, and
  // Express runs a router's own middleware for every request that reaches
  // it regardless of whether any of its routes match. Mounted at "/api"
  // alongside every other router, that middleware would reject (403) a
  // non-admin's request before it ever reached automationsRouter/
  // runsRouter/etc. further down the stack — a real bug caught by
  // auth.test.ts's "lets a viewer read automations" case. Scoping the
  // mount path means Express only dispatches into this router for
  // requests actually under /api/admin.
  app.use("/api/admin", adminRouter());
  app.use("/api", automationsRouter(planLimiter));
  app.use("/api", runsRouter());
  app.use("/api", notificationsRouter());

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error("[error]", err);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
