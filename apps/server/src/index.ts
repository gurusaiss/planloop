import "dotenv/config";
import { createApp } from "./app.js";
import { db } from "./db/index.js";
import { closeBrowser } from "./tools/browserSnapshot.js";
import { resolveJwtSecret } from "./lib/jwt.js";
import { ensureEncryptionKeyConfigured } from "./lib/crypto.js";
import { startScheduler } from "./scheduler/index.js";

// Fail fast on missing production secrets rather than discovering it on the
// first request (or, worse, silently falling back to an insecure default —
// see docs/SECURITY.md).
try {
  resolveJwtSecret();
  ensureEncryptionKeyConfigured();
} catch (err: any) {
  console.error(`[startup] ${err.message}`);
  process.exit(1);
}

const app = createApp();

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  console.log(`[startup] server listening on http://localhost:${port}`);
  startScheduler();
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
