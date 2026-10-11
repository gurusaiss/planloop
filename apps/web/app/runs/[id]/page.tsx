"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { IconCheck, IconX, IconClock, IconSpinner } from "@/components/icons";

const STEP_DOT: Record<string, { icon: typeof IconCheck; cls: string }> = {
  success: { icon: IconCheck, cls: "success" },
  failed: { icon: IconX, cls: "failed" },
  waiting_approval: { icon: IconClock, cls: "waiting_approval" },
  skipped: { icon: IconClock, cls: "waiting_approval" },
  running: { icon: IconSpinner, cls: "running" },
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

  if (!data) {
    return error ? (
      <div className="error-box">{error}</div>
    ) : (
      <>
        <div className="skeleton" style={{ height: 28, width: 260 }} />
        <div className="skeleton" style={{ marginTop: 20 }} />
        <div className="skeleton" />
      </>
    );
  }

  const pendingApproval = data.approvals.find((a: any) => a.status === "pending");

  return (
    <>
      <div className="row-between">
        <h1 className="mono" style={{ fontSize: 17 }}>Run {data.run.id}</h1>
        <span className={`status ${data.run.status}`}>{data.run.status.replace("_", " ")}</span>
      </div>
      <p className="subtitle">Triggered: {data.run.trigger_type} · Started: {data.run.started_at ? new Date(data.run.started_at).toLocaleString() : "—"}</p>

      {error && <div className="error-box">{error}</div>}

      {pendingApproval && (
        <div className="card" style={{ borderColor: "var(--medium)", borderWidth: 1.5 }}>
          <div className="row" style={{ marginBottom: 4 }}>
            <IconClock size={18} className="mono" />
            <strong>Approval required</strong>
          </div>
          <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5 }}>
            Step <span className="mono">{pendingApproval.step_id}</span> is{" "}
            <span className={`badge ${pendingApproval.risk_level}`}>{pendingApproval.risk_level}</span> risk
            and is waiting for your decision before it runs.
          </p>
          <div className="row">
            <button disabled={resolving} onClick={() => decide(pendingApproval.id, "approved")}>
              Approve &amp; continue
            </button>
            <button className="danger" disabled={resolving} onClick={() => decide(pendingApproval.id, "rejected")}>
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Execution log</h2>
        {data.steps.length === 0 && <p style={{ color: "var(--ink-dim)", fontSize: 14 }}>No steps executed yet.</p>}
        <div className="stepper">
          {data.steps.map((s: any) => {
            const dot = STEP_DOT[s.status] ?? STEP_DOT.waiting_approval;
            const Icon = dot.icon;
            return (
              <div className="stepper-item" key={s.id}>
                <div className="stepper-rail" />
                <div className={`stepper-dot ${dot.cls}`}>
                  <Icon size={13} />
                </div>
                <div style={{ flex: 1, paddingTop: 2 }}>
                  <div className="row-between">
                    <div>
                      {s.label}{" "}
                      {s.attempt > 1 && <span style={{ color: "var(--ink-dim)", fontSize: 12 }}>(attempt {s.attempt})</span>}
                    </div>
                    <span className={`status ${s.status}`} style={{ flexShrink: 0 }}>
                      {s.status.replace("_", " ")}
                    </span>
                  </div>
                  {s.error && <div className="mono error-box" style={{ marginTop: 8 }}>{s.error}</div>}
                  {s.output_json && s.status === "success" && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", color: "var(--ink-dim)", fontSize: 12.5 }}>output</summary>
                      <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 6, background: "var(--bg)", padding: 10, borderRadius: 6, border: "1px solid var(--border)" }}>
                        {JSON.stringify(JSON.parse(s.output_json), null, 2).slice(0, 1500)}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
