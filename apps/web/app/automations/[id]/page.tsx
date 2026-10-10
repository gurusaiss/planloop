"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function AutomationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [automation, setAutomation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = () => api.getAutomation(id).then(setAutomation).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const { runId } = await api.runAutomation(id);
      router.push(`/runs/${runId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  async function toggle() {
    try {
      if (automation.status === "active") await api.pauseAutomation(id);
      else await api.activateAutomation(id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${automation.title}"? This stops its schedule and hides it from the list, but past runs stay in history.`)) return;
    try {
      await api.deleteAutomation(id);
      router.push("/automations");
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!automation) return error ? <div className="error-box">{error}</div> : <p>Loading…</p>;

  return (
    <>
      <div className="row-between">
        <h1>{automation.title}</h1>
        <span className={`status ${automation.status}`}>{automation.status}</span>
      </div>
      <p className="mono subtitle">{automation.plan.trigger.type === "schedule" ? `Schedule: ${automation.cron}` : "Manual trigger"}</p>

      <div className="card">
        <h2>Steps</h2>
        {automation.plan.steps.map((s: any, i: number) => (
          <div className="step" key={s.id}>
            <span className="mono" style={{ color: "#9aa1ab" }}>{i + 1}</span>
            <span style={{ flex: 1 }}>{s.label}</span>
            <span className={`badge ${s.riskLevel}`}>{s.riskLevel}</span>
          </div>
        ))}
      </div>

      {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={runNow} disabled={running}>{running ? "Starting…" : "Run now"}</button>
        <button className="secondary" onClick={toggle}>
          {automation.status === "active" ? "Pause" : "Activate"}
        </button>
        <Link href="/runs"><button className="secondary">View runs</button></Link>
        <button className="danger" onClick={remove}>Delete</button>
      </div>
    </>
  );
}
