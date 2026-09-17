"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function RunsPage() {
  const [runs, setRuns] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listRuns().then(setRuns).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h1>Runs</h1>
      <p className="subtitle">Execution history across all automations.</p>
      {error && <div className="error-box">{error}</div>}
      {runs === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}
      {runs && runs.length === 0 && <div className="empty">No runs yet.</div>}
      {runs?.map((r) => (
        <Link key={r.id} href={`/runs/${r.id}`} className="list-item">
          <div className="row-between">
            <span className="mono">{r.id}</span>
            <span className={`status ${r.status}`}>{r.status}</span>
          </div>
          <div style={{ color: "#9aa1ab", marginTop: 6, fontSize: 12 }}>
            {r.trigger_type} · {new Date(r.created_at).toLocaleString()}
          </div>
        </Link>
      ))}
    </>
  );
}
