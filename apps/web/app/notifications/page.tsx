"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function NotificationsPage() {
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.listNotifications().then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function markRead(id: string) {
    try {
      await api.markNotificationRead(id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      <h1>Notifications</h1>
      <p className="subtitle">Everything your automations have sent you.</p>
      {error && <div className="error-box">{error}</div>}
      {items === null && !error && <div className="skeleton" />}
      {items?.length === 0 && <div className="empty">No notifications yet.</div>}
      {items?.map((n) => (
        <div className="card" key={n.id} style={{ opacity: n.read_at ? 0.6 : 1 }}>
          <div className="row-between">
            <strong>{n.subject || "(no subject)"}</strong>
            <span className={`badge ${n.channel === "email" ? "low" : "medium"}`}>{n.channel}</span>
          </div>
          <p style={{ fontSize: 14, color: "var(--ink)", marginTop: 8, whiteSpace: "pre-wrap" }}>{n.body}</p>
          <div className="row-between" style={{ marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>{new Date(n.created_at).toLocaleString()}</span>
            {!n.read_at && (
              <button className="secondary" onClick={() => markRead(n.id)}>
                Mark read
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
