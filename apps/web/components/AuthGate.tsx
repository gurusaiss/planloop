"use client";

import { useEffect, useState } from "react";
import { getToken, setToken } from "@/lib/auth";
import { api, UnauthorizedError } from "@/lib/api";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const existing = getToken();
    if (!existing) {
      setChecked(true);
      return;
    }
    api
      .listAutomations()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setChecked(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setVerifying(true);
    setError(null);
    setToken(input.trim());
    try {
      await api.listAutomations();
      setAuthed(true);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setError("That token was rejected. Double-check the ADMIN_TOKEN value from the server's environment/log.");
      } else {
        setError(e instanceof Error ? e.message : "Could not reach the API.");
      }
    } finally {
      setVerifying(false);
    }
  }

  if (!checked) return null; // avoid a flash of the login form on a valid session

  if (!authed) {
    return (
      <div className="shell" style={{ maxWidth: 420, paddingTop: 80 }}>
        <h1>Connect to your automation server</h1>
        <p className="subtitle">
          Enter the API bearer token. It's the <span className="mono">ADMIN_TOKEN</span> you set in the
          server's environment — or the one it printed to its own log on startup if you didn't set one.
        </p>
        <form onSubmit={submit}>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Bearer token"
            autoFocus
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button type="submit" disabled={verifying || !input.trim()}>
              {verifying ? "Connecting…" : "Connect"}
            </button>
          </div>
        </form>
        {error && (
          <div className="error-box" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
