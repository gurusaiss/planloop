"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";
import AuthBrandPanel from "@/components/AuthBrandPanel";
import { IconSpinner, IconCheck } from "@/components/icons";

function InviteForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, loading: authLoading, refresh } = useAuth();
  const [status, setStatus] = useState<"idle" | "accepting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || !token || status !== "idle") return;
    setStatus("accepting");
    api
      .acceptInvite(token)
      .then(async (res) => {
        setWorkspaceName(res.workspaceName);
        await refresh();
        setStatus("done");
      })
      .catch((e) => {
        setError(e.message);
        setStatus("error");
      });
  }, [authLoading, user, token, status]);

  const body = !token ? (
    <div className="error-box">Missing invite token — check the link and try again.</div>
  ) : !authLoading && !user ? (
    <>
      <h1>You&apos;ve been invited</h1>
      <p className="subtitle">Log in or create an account to accept this invite.</p>
      <div className="row">
        <Link href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}>
          <button>Log in</button>
        </Link>
        <Link href={`/register?next=${encodeURIComponent(`/invite?token=${token}`)}`}>
          <button className="secondary">Create account</button>
        </Link>
      </div>
    </>
  ) : (
    <>
      <h1>Workspace invite</h1>
      {status === "accepting" && (
        <div className="row" style={{ color: "var(--ink-dim)" }}>
          <IconSpinner size={18} />
          <span>Accepting invite…</span>
        </div>
      )}
      {status === "error" && <div className="error-box">{error}</div>}
      {status === "done" && (
        <>
          <div className="row" style={{ color: "var(--low)", marginBottom: 16 }}>
            <IconCheck size={18} />
            <span>
              You&apos;ve joined {workspaceName ? <strong>{workspaceName}</strong> : "the workspace"}.
            </span>
          </div>
          <Link href="/">
            <button>Go to dashboard</button>
          </Link>
        </>
      )}
    </>
  );

  return (
    <div className="auth-layout">
      <AuthBrandPanel />
      <div className="auth-form-panel">
        <div className="auth-form-box">{body}</div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteForm />
    </Suspense>
  );
}
