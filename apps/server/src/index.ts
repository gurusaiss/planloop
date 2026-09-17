import "dotenv/config";
import express from "express";
import cors from "cors";
import { selectProvider } from "./providers/index.js";
import { automationsRouter } from "./routes/automations.js";
import { runsRouter } from "./routes/runs.js";
import { startScheduler } from "./scheduler/index.js";
import { db } from "./db/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const provider = selectProvider();
console.log(`[startup] AI provider: ${provider.name} (local=${provider.isLocal})`);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: provider.name });
});

app.use("/api", automationsRouter(provider));
app.use("/api", runsRouter(provider));

app.get("/api/notifications", (_req, res) => {
  const rows = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50").all();
  res.json(rows);
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`[startup] server listening on http://localhost:${port}`);
  startScheduler(provider);
});
