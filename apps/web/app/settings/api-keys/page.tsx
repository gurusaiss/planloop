"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";
import SettingsNav from "@/components/SettingsNav";

const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export default function ApiKeysPage() {
  const { activeWorkspace } = useAuth();
  const canManage = activeWorkspace && ROLE_RANK[activeWorkspace.role] >= ROLE_RANK.admin;

  const [keys, setKeys] = useState<any[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.listApiKeys().then(setKeys).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await api.createApiKey(name);
      setNewToken(res.token);
      setName("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this API key? Anything using it will stop working immediately.")) return;
    try {
      await api.revokeApiKey(id);
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
        <h2>API keys</h2>
        <p style={{ fontSize: 13, color: "#9aa1ab", marginBottom: 12 }}>
          Use an API key as a bearer token to call the API programmatically (same endpoints the UI uses — see docs/API.md).
        </p>

        {newToken && (
          <div className="card" style={{ borderColor: "#3fb950", marginBottom: 12 }}>
            <strong>Copy this now — it won&apos;t be shown again:</strong>
            <div className="mono" style={{ marginTop: 8, wordBreak: "break-all", background: "#0b0d10", padding: 10, borderRadius: 6 }}>
              {newToken}
            </div>
            <button className="secondary" style={{ marginTop: 10 }} onClick={() => setNewToken(null)}>
              Done
            </button>
          </div>
        )}

        {canManage && (
          <form onSubmit={create} className="row" style={{ marginBottom: 16 }}>
            <input placeholder="Key name (e.g. CI pipeline)" value={name} onChange={(e) => setName(e.target.value)} required style={{ maxWidth: 260 }} />
            <button type="submit" disabled={creating}>{creating ? "Creating…" : "Create key"}</button>
          </form>
        )}

        {keys === null && <div className="skeleton" />}
        {keys?.length === 0 && <p className="empty">No API keys yet.</p>}
        {keys?.map((k) => (
          <div className="step" key={k.id}>
            <div style={{ flex: 1 }}>
              <div className="mono">{k.prefix}…</div>
              <div style={{ fontSize: 12, color: "#9aa1ab" }}>
                {k.name} · created {new Date(k.created_at).toLocaleDateString()}
                {k.last_used_at && ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`}
              </div>
            </div>
            {k.revoked_at ? (
              <span className="badge high">revoked</span>
            ) : (
              canManage && <button className="danger" onClick={() => revoke(k.id)}>Revoke</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
