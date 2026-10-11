"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { IconShield, IconLayers } from "@/components/icons";

interface PlanStep {
  id: string;
  label: string;
  riskLevel: "low" | "medium" | "high";
  kind: string;
}
interface Plan {
  id: string;
  title: string;
  summary: string;
  trigger: { type: string; cron?: string };
  steps: PlanStep[];
  requiresApproval: boolean;
}

const EXAMPLES = [
  "Every day at 8am check https://pypi.org/ and notify me if anything changed",
  "organize files in folder inbox",
];

export default function HomePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ plan: Plan; rationale: string } | null>(null);
  const [activating, setActivating] = useState(false);

  async function submitPlan() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.plan(text.trim());
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function activate() {
    if (!result) return;
    setActivating(true);
    setError(null);
    try {
      const automation = await api.createAutomation(result.plan);
      router.push(`/automations/${automation.id}`);
    } catch (e: any) {
      setError(e.message);
      setActivating(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submitPlan();
    }
  }

  return (
    <>
      <h1>What do you want automated?</h1>
      <p className="subtitle">
        Describe the task in plain language. You&apos;ll see the exact plan — every step, every risk — before
        anything runs.
      </p>

      <div style={{ position: "relative" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Every weekday at 8am check https://example.com and notify me if anything changed"
          style={{ fontSize: 16, minHeight: 110, paddingBottom: 36 }}
        />
        <span
          className="mono"
          style={{
            position: "absolute",
            right: 14,
            bottom: 12,
            fontSize: 11,
            color: "var(--ink-faint)",
            pointerEvents: "none",
          }}
        >
          ⌘ + Enter
        </span>
      </div>

      <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={submitPlan} disabled={loading || !text.trim()}>
          {loading ? "Planning…" : "Generate plan"}
        </button>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="secondary" onClick={() => setText(ex)}>
            {ex.length > 40 ? ex.slice(0, 40) + "…" : ex}
          </button>
        ))}
      </div>

      {error && (
        <div className="card">
          <div className="error-box">{error}</div>
        </div>
      )}

      {result && (
        <div className="card" style={{ animation: "rise 0.3s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div className="row-between">
            <div className="row" style={{ gap: 10 }}>
              <IconLayers size={18} className="mono" />
              <h1 style={{ fontSize: 19, margin: 0 }}>{result.plan.title}</h1>
            </div>
            <span className="badge" style={{ background: "var(--accent-wash)", color: "var(--accent)" }}>
              {result.plan.trigger.type === "schedule"
                ? result.plan.summary.split("\n")[0].replace("Trigger: ", "")
                : "manual trigger"}
            </span>
          </div>

          <h2 style={{ marginTop: 20 }}>Steps</h2>
          {result.plan.steps.map((s, i) => (
            <div className="step" key={s.id}>
              <span
                className="mono"
                style={{
                  color: "var(--ink-dim)",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>{s.label}</span>
              <span className={`badge ${s.riskLevel}`}>{s.riskLevel}</span>
            </div>
          ))}

          <h2 style={{ marginTop: 20 }}>Why this plan</h2>
          <p style={{ color: "var(--ink)", fontSize: 14.5, lineHeight: 1.6 }}>{result.rationale}</p>

          {result.plan.requiresApproval && (
            <div className="row" style={{ fontSize: 13, color: "var(--medium)", alignItems: "flex-start", marginTop: 4 }}>
              <IconShield size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                This plan includes a medium/high-risk step. It will pause and wait for your explicit approval
                before that step runs, every time.
              </span>
            </div>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={activate} disabled={activating}>
              {activating ? "Activating…" : "Review & Activate"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
