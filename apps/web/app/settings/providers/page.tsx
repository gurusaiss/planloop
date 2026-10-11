"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";
import SettingsNav from "@/components/SettingsNav";

const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
const PROVIDERS = [
  { id: "local", label: "Local (free, built-in heuristic — no API key needed)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Google Gemini" },
];

export default function ProvidersPage() {
  const { activeWorkspace } = useAuth();
  const canManage = activeWorkspace && ROLE_RANK[activeWorkspace.role] >= ROLE_RANK.admin;

  const [configs, setConfigs] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { apiKey: string; model: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    api.listProviderConfigs().then(setConfigs).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function configFor(provider: string) {
    return configs?.find((c) => c.provider === provider);
  }

  async function save(provider: string, isDefault: boolean) {
    setSaving(provider);
    setError(null);
    try {
      const values = form[provider] ?? { apiKey: "", model: "" };
      await api.upsertProviderConfig({
        provider,
        apiKey: values.apiKey || undefined,
        model: values.model || undefined,
        enabled: true,
        isDefault,
      });
      setForm((f) => ({ ...f, [provider]: { apiKey: "", model: values.model } }));
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  async function remove(provider: string) {
    if (!confirm(`Remove the ${provider} configuration for this workspace?`)) return;
    try {
      await api.deleteProviderConfig(provider);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <SettingsNav />
      <p className="subtitle">
        Configure which AI provider this workspace&apos;s automations use. Without any configuration here, the
        workspace falls back to the server&apos;s own default (an env-configured provider, or the free local
        heuristic) — see docs/AGENTS.md.
      </p>
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      {configs === null && <div className="skeleton" />}

      {PROVIDERS.map((p) => {
        const existing = configFor(p.id);
        const values = form[p.id] ?? { apiKey: "", model: existing?.model ?? "" };
        return (
          <div className="card" key={p.id}>
            <div className="row-between">
              <h2 style={{ marginBottom: 0 }}>{p.label}</h2>
              {existing?.is_default && <span className="badge low">default</span>}
            </div>

            {p.id !== "local" && (
              <>
                <p style={{ fontSize: 12, color: "var(--ink-dim)", margin: "8px 0" }}>
                  {existing?.has_api_key ? "API key is set (hidden)." : "No API key set yet."}
                </p>
                {canManage && (
                  <div className="row" style={{ marginBottom: 8 }}>
                    <input
                      type="password"
                      placeholder={existing?.has_api_key ? "Replace API key" : "API key"}
                      value={values.apiKey}
                      onChange={(e) => setForm((f) => ({ ...f, [p.id]: { ...values, apiKey: e.target.value } }))}
                      style={{ maxWidth: 260 }}
                    />
                    <input
                      placeholder="Model (optional override)"
                      value={values.model}
                      onChange={(e) => setForm((f) => ({ ...f, [p.id]: { ...values, model: e.target.value } }))}
                      style={{ maxWidth: 200 }}
                    />
                  </div>
                )}
              </>
            )}

            {canManage && (
              <div className="row">
                <button onClick={() => save(p.id, true)} disabled={saving === p.id}>
                  {saving === p.id ? "Saving…" : existing?.is_default ? "Save" : "Set as default"}
                </button>
                {existing && <button className="secondary" onClick={() => remove(p.id)}>Remove</button>}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
