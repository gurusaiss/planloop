import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { selectProvider } from "./providers/index.js";
import { automationsRouter } from "./routes/automations.js";
import { runsRouter } from "./routes/runs.js";
import { startScheduler } from "./scheduler/index.js";
import { db } from "./db/index.js";
import { closeBrowser } from "./tools/browserSnapshot.js";
import { requireAuth, resolveAdminToken } from "./middleware/auth.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());

// Restricted to the configured frontend origin, not "*" — see docs/SECURITY.md.
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
app.use(cors({ origin: corsOrigin }));

app.use(express.json({ limit: "1mb" }));

// Generous global limit (abuse/DoS backstop) plus a tighter one on the
// planning endpoint, which is the most expensive call (LLM/network-bound).
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
const planLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

const provider = selectProvider();
console.log(`[startup] AI provider: ${provider.name} (local=${provider.isLocal})`);

const adminToken = resolveAdminToken();
const auth = requireAuth(adminToken);

// Health check is intentionally unauthenticated (needed by load balancers /
// container orchestrators / uptime checks before any credential exists).
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: provider.name });
});

app.use("/api", auth, automationsRouter(provider, planLimiter));
app.use("/api", auth, runsRouter(provider));

app.get("/api/notifications", auth, (_req, res) => {
  const rows = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50").all();
  res.json(rows);
});

// Centralized error handler — every async route is wrapped with
// asyncHandler() so a thrown/rejected error lands here instead of hanging
// the request. Never leaks stack traces to the client.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  console.log(`[startup] server listening on http://localhost:${port}`);
  startScheduler(provider);
});

// Graceful shutdown: stop accepting new connections, close the browser
// instance the browser_snapshot tool holds open, then exit. Prevents an
// orphaned headless Chromium process on redeploy/restart.
async function shutdown(signal: string) {
  console.log(`[shutdown] received ${signal}, closing…`);
  server.close(() => console.log("[shutdown] HTTP server closed"));
  await closeBrowser();
  db.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
