"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";

type Tab = "overview" | "users" | "workspaces" | "audit" | "usage";

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  if (user && user.role !== "owner" && user.role !== "admin") {
    return (
      <>
        <h1>Admin</h1>
        <div className="error-box">You don&apos;t have system admin access.</div>
      </>
    );
  }

  return (
    <>
      <h1>Admin</h1>
      <p className="subtitle">Instance-wide: every user and workspace, not just the one you&apos;re in.</p>

      <div className="row" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        {(["overview", "users", "workspaces", "audit", "usage"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "" : "secondary"} onClick={() => setTab(t)} style={{ textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview />}
      {tab === "users" && <Users currentUserId={user?.id} currentUserRole={user?.role} />}
      {tab === "workspaces" && <Workspaces />}
      {tab === "audit" && <AuditLog />}
      {tab === "usage" && <Usage />}
    </>
  );
}

function Overview() {
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.admin.stats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!stats) return <div className="skeleton" />;

  const groups: { label: string; items: { label: string; value: number; flagged?: boolean }[] }[] = [
    {
      label: "People & workspaces",
      items: [
        { label: "Users", value: stats.users },
        { label: "Active users", value: stats.activeUsers },
        { label: "Workspaces", value: stats.workspaces },
        { label: "Automations", value: stats.automations },
      ],
    },
    {
      label: "Runs",
      items: [
        { label: "Total", value: stats.runsTotal },
        { label: "Succeeded", value: stats.runsSucceeded },
        { label: "Failed", value: stats.runsFailed, flagged: stats.runsFailed > 0 },
        { label: "Pending approval", value: stats.pendingApprovals, flagged: stats.pendingApprovals > 0 },
      ],
    },
  ];

  return (
    <div className="stat-row">
      {groups.map((g) => (
        <div className="stat-group" key={g.label}>
          <div className="stat-group-label">{g.label}</div>
          <div className="stat-group-items">
            {g.items.map((it) => (
              <div key={it.label}>
                <div className={`stat-item-value${it.flagged ? " flagged" : ""}`}>{it.value}</div>
                <div className="stat-item-label">{it.label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Users({ currentUserId, currentUserRole }: { currentUserId?: string; currentUserRole?: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.admin.listUsers().then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function setStatus(id: string, status: "active" | "suspended") {
    try {
      await api.admin.updateUserStatus(id, status);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function setRole(id: string, role: string) {
    try {
      await api.admin.updateUserRole(id, role);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="skeleton" />;

  return (
    <div className="card">
      <h2>Users ({data.total})</h2>
      {data.items.map((u: any) => (
        <div className="step" key={u.id}>
          <div style={{ flex: 1 }}>
            <div>{u.name} {u.id === currentUserId && <span style={{ color: "var(--ink-dim)" }}>(you)</span>}</div>
            <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{u.email} · joined {new Date(u.created_at).toLocaleDateString()}</div>
          </div>
          <select
            value={u.role}
            disabled={u.id === currentUserId || (u.role === "owner" && currentUserRole !== "owner")}
            onChange={(e) => setRole(u.id, e.target.value)}
            style={{ background: "var(--bg-raised)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", marginRight: 8 }}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
            {currentUserRole === "owner" && <option value="owner">owner</option>}
          </select>
          <span className={`status ${u.status === "active" ? "succeeded" : "failed"}`} style={{ marginRight: 8 }}>{u.status}</span>
          {u.id !== currentUserId && (
            <button
              className={u.status === "active" ? "danger" : "secondary"}
              onClick={() => setStatus(u.id, u.status === "active" ? "suspended" : "active")}
            >
              {u.status === "active" ? "Suspend" : "Activate"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Workspaces() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.admin.listWorkspaces().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="skeleton" />;

  return (
    <div className="card">
      <h2>Workspaces ({data.total})</h2>
      {data.items.map((w: any) => (
        <div className="step" key={w.id}>
          <div style={{ flex: 1 }}>
            <div>{w.name}</div>
            <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>
              {w.member_count} member{w.member_count === 1 ? "" : "s"} · {w.automation_count} automation
              {w.automation_count === 1 ? "" : "s"} · created {new Date(w.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditLog() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.admin.auditLog().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="skeleton" />;

  return (
    <div className="card">
      <h2>Audit log ({data.total})</h2>
      {data.items.map((a: any) => (
        <div className="step" key={a.id}>
          <div style={{ flex: 1 }}>
            <span className="mono">{a.action}</span>{" "}
            <span style={{ color: "var(--ink-dim)" }}>
              {a.user_email && `by ${a.user_email}`} {a.workspace_name && `in ${a.workspace_name}`}
            </span>
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>{new Date(a.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Usage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.admin.usage().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="skeleton" />;
  if (data.length === 0) return <p className="empty">No usage recorded yet.</p>;

  return (
    <div className="card">
      <h2>Usage by workspace</h2>
      {data.map((row: any, i: number) => (
        <div className="step" key={i}>
          <div style={{ flex: 1 }}>
            {row.workspace_name} · <span className="mono">{row.kind}</span>
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>
            {row.events} events
            {row.tokens_in || row.tokens_out ? ` · ${row.tokens_in ?? 0} in / ${row.tokens_out ?? 0} out tokens` : ""}
            {row.duration_ms ? ` · ${Math.round(row.duration_ms / 1000)}s` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
