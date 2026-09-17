"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listAutomations().then(setAutomations).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h1>Automations</h1>
      <p className="subtitle">Everything you&apos;ve activated. Manual or scheduled.</p>

      {error && <div className="error-box">{error}</div>}
      {automations === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}
      {automations && automations.length === 0 && (
        <div className="empty">
          No automations yet. <Link href="/">Create one</Link>.
        </div>
      )}

      {automations?.map((a) => (
        <Link key={a.id} href={`/automations/${a.id}`} className="list-item">
          <div className="row-between">
            <strong>{a.title}</strong>
            <span className={`status ${a.status}`}>{a.status}</span>
          </div>
          <div className="mono" style={{ color: "#9aa1ab", marginTop: 6, fontSize: 12 }}>
            {a.cron ? `schedule: ${a.cron}` : "manual trigger"}
          </div>
        </Link>
      ))}
    </>
  );
}
