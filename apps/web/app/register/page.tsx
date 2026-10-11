"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import AuthBrandPanel from "@/components/AuthBrandPanel";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register(email, password, name);
      router.replace(params.get("next") || "/");
    } catch (e: any) {
      setError(e.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-layout">
      <AuthBrandPanel />
      <div className="auth-form-panel">
        <div className="auth-form-box">
          <h1>Create your account</h1>
          <p className="subtitle">A personal workspace is created automatically — no setup wizard.</p>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="name">Full name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Min 10 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                required
              />
            </div>
            {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
          <p style={{ marginTop: 20, fontSize: 14, color: "var(--ink-dim)" }}>
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
