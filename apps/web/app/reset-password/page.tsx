"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.requestPasswordReset(email);
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.resetPassword(token!, newPassword);
      router.replace("/login");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto" }}>
      <h1>Reset password</h1>

      {!token && !done && (
        <form onSubmit={requestReset}>
          <p className="subtitle">We&apos;ll email you a reset link if the account exists.</p>
          <div style={{ marginBottom: 10 }}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </div>
          {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      {!token && done && <p>If an account exists for that email, a reset link has been sent.</p>}

      {token && (
        <form onSubmit={confirmReset}>
          <p className="subtitle">Choose a new password.</p>
          <div style={{ marginBottom: 10 }}>
            <input
              type="password"
              placeholder="New password (min 10 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={10}
              autoFocus
              required
            />
          </div>
          {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}

      <p style={{ marginTop: 16, fontSize: 14, color: "#9aa1ab" }}>
        <Link href="/login">Back to login</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
