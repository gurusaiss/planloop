"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import AuthBrandPanel from "@/components/AuthBrandPanel";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      router.replace(params.get("next") || "/");
    } catch (e: any) {
      setError(e.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-layout">
      <AuthBrandPanel />
      <div className="auth-form-panel">
        <div className="auth-form-box">
          <h1>Welcome back</h1>
          <p className="subtitle">Log in to pick up where you left off.</p>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>
          <p style={{ marginTop: 20, fontSize: 14, color: "var(--ink-dim)" }}>
            <Link href="/reset-password">Forgot password?</Link>
          </p>
          <p style={{ marginTop: 8, fontSize: 14, color: "var(--ink-dim)" }}>
            No account? <Link href="/register">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
