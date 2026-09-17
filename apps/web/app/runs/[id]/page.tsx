"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

const STATUS_ICON: Record<string, string> = {
  success: "✓",
  failed: "✕",
  waiting_approval: "⏸",
  skipped: "–",
};

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(() => {
    api.getRun(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the run is in flight so the approval prompt and live logs
  // appear without a manual refresh.
  useEffect(() => {
    if (!data || !["queued", "running", "pending_approval"].includes(data.run.status)) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [data, load]);

  async function decide(approvalId: string, decision: "approved" | "rejected") {
    setResolving(true);
    setError(null);
    try {
      await api.resolveApproval(id, approvalId, decision);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResolving(false);
    }
  }

  if (!data) return error ? <div className="error-box">{error}</div> : <p>Loading…</p>;

  const pendingApproval = data.approvals.find((a: any) => a.status === "pending");

  return (
    <>
      <div className="row-between">
        <h1 className="mono" style={{ fontSize: 18 }}>Run {data.run.id}</h1>
        <span className={`status ${data.run.status}`}>{data.run.status}</span>
      </div>
      <p className="subtitle">Triggered: {data.run.trigger_type} · Started: {data.run.started_at ?? "—"}</p>

      {error && <div className="error-box">{error}</div>}

      {pendingApproval && (
        <div className="card" style={{ borderColor: "#d29922" }}>
          <strong>Approval required</strong>
          <p style={{ fontSize: 14, color: "#c9cdd3" }}>
            Step <span className="mono">{pendingApproval.step_id}</span> is{" "}
            <span className={`badge ${pendingApproval.risk_level}`}>{pendingApproval.risk_level}</span> risk
            and is waiting for your decision before it runs.
          </p>
          <div className="row">
            <button disabled={resolving} onClick={() => decide(pendingApproval.id, "approved")}>
              Approve & continue
            </button>
            <button className="danger" disabled={resolving} onClick={() => decide(pendingApproval.id, "rejected")}>
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Execution log</h2>
        {data.steps.length === 0 && <p style={{ color: "#9aa1ab" }}>No steps executed yet.</p>}
        {data.steps.map((s: any) => (
          <div className="step" key={s.id}>
            <span className="mono">{STATUS_ICON[s.status] ?? "•"}</span>
            <div style={{ flex: 1 }}>
              <div>{s.label} <span style={{ color: "#9aa1ab", fontSize: 12 }}>(attempt {s.attempt})</span></div>
              {s.error && <div className="mono error-box" style={{ marginTop: 6 }}>{s.error}</div>}
              {s.output_json && s.status === "success" && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: "pointer", color: "#9aa1ab", fontSize: 12 }}>output</summary>
                  <div className="mono" style={{ fontSize: 12, color: "#9aa1ab", marginTop: 4 }}>
                    {JSON.stringify(JSON.parse(s.output_json), null, 2).slice(0, 1500)}
                  </div>
                </details>
              )}
            </div>
            <span className={`status ${s.status}`}>{s.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}
