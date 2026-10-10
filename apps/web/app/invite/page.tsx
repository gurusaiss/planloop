"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";

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

  if (!token) return <p style={{ margin: 80 }}>Missing invite token.</p>;

  if (!authLoading && !user) {
    const next = encodeURIComponent(`/invite?token=${token}`);
    return (
      <div style={{ maxWidth: 420, margin: "80px auto" }}>
        <h1>You&apos;ve been invited</h1>
        <p className="subtitle">Log in or create an account to accept this invite.</p>
        <div className="row">
          <Link href={`/login?next=${next}`}><button>Log in</button></Link>
          <Link href={`/register?next=${next}`}><button className="secondary">Create account</button></Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto" }}>
      <h1>Workspace invite</h1>
      {status === "accepting" && <p>Accepting invite…</p>}
      {status === "error" && <div className="error-box">{error}</div>}
      {status === "done" && (
        <>
          <p>You&apos;ve joined {workspaceName ? <strong>{workspaceName}</strong> : "the workspace"}.</p>
          <Link href="/"><button>Go to dashboard</button></Link>
        </>
      )}
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
