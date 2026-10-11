"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";
import SettingsNav from "@/components/SettingsNav";

const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export default function WorkspacePage() {
  const { activeWorkspace, user, refresh } = useAuth();
  const canManage = activeWorkspace && ROLE_RANK[activeWorkspace.role] >= ROLE_RANK.admin;

  const [name, setName] = useState("");
  const [members, setMembers] = useState<any[] | null>(null);
  const [invites, setInvites] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  function load() {
    api.getCurrentWorkspace().then((w) => setName(w.name)).catch((e) => setError(e.message));
    api.listMembers().then(setMembers).catch((e) => setError(e.message));
    if (canManage) api.listInvites().then(setInvites).catch(() => {});
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.updateCurrentWorkspace(name);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteResult(null);
    setError(null);
    try {
      const res = await api.inviteMember(inviteEmail, inviteRole);
      setInviteResult(
        res.emailDelivery?.delivered
          ? `Invite emailed to ${inviteEmail}.`
          : `Email not sent (${res.emailDelivery?.detail}). Share this link manually: ${res.acceptUrl}`
      );
      setInviteEmail("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    try {
      await api.updateMemberRole(userId, role);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the workspace?")) return;
    try {
      await api.removeMember(userId);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function revokeInvite(id: string) {
    try {
      await api.revokeInvite(id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <SettingsNav />
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card">
        <h2>Workspace</h2>
        <form onSubmit={saveName} className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} style={{ maxWidth: 300 }} />
          {canManage && <button type="submit">Save</button>}
        </form>
        <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 8 }}>Your role here: {activeWorkspace?.role}</p>
      </div>

      <div className="card">
        <h2>Members</h2>
        {members === null && <div className="skeleton" />}
        {members?.map((m) => (
          <div className="step" key={m.id}>
            <div style={{ flex: 1 }}>
              <div>{m.name} {m.user_id === user?.id && <span style={{ color: "var(--ink-dim)" }}>(you)</span>}</div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{m.email}</div>
            </div>
            {canManage && m.user_id !== user?.id ? (
              <select
                value={m.role}
                onChange={(e) => changeRole(m.user_id, e.target.value)}
                style={{ background: "var(--bg-raised)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}
              >
                <option value="viewer">viewer</option>
                <option value="member">member</option>
                <option value="admin">admin</option>
                {activeWorkspace?.role === "owner" && <option value="owner">owner</option>}
              </select>
            ) : (
              <span className="badge low">{m.role}</span>
            )}
            {canManage && m.user_id !== user?.id && (
              <button className="danger" style={{ marginLeft: 8 }} onClick={() => removeMember(m.user_id)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <div className="card">
          <h2>Invite a member</h2>
          <form onSubmit={invite} className="row">
            <input
              type="email"
              placeholder="Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              style={{ maxWidth: 260 }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{ background: "var(--bg-raised)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px" }}
            >
              <option value="viewer">viewer</option>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button type="submit" disabled={inviting}>{inviting ? "Sending…" : "Send invite"}</button>
          </form>
          {inviteResult && <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 10, wordBreak: "break-all" }}>{inviteResult}</p>}

          {invites && invites.filter((i) => !i.accepted_at).length > 0 && (
            <>
              <h2 style={{ marginTop: 20 }}>Pending invites</h2>
              {invites.filter((i) => !i.accepted_at).map((i) => (
                <div className="step" key={i.id}>
                  <div style={{ flex: 1 }}>{i.email} <span className="badge medium">{i.role}</span></div>
                  <button className="secondary" onClick={() => revokeInvite(i.id)}>Revoke</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
