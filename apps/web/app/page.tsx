"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

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

  return (
    <>
      <h1>What do you want automated?</h1>
      <p className="subtitle">
        Describe the task in plain language. You&apos;ll see the exact plan before anything runs.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Every weekday at 8am check https://example.com and notify me if anything changed"
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={submitPlan} disabled={loading || !text.trim()}>
          {loading ? "Planning…" : "Generate plan"}
        </button>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="secondary" onClick={() => setText(ex)}>
            {ex.length > 34 ? ex.slice(0, 34) + "…" : ex}
          </button>
        ))}
      </div>

      {error && (
        <div className="card">
          <div className="error-box">{error}</div>
        </div>
      )}

      {result && (
        <div className="card">
          <div className="row-between">
            <h1 style={{ fontSize: 18 }}>{result.plan.title}</h1>
            <span className="badge" style={{ background: "rgba(91,140,255,0.15)", color: "#5b8cff" }}>
              {result.plan.trigger.type === "schedule"
                ? result.plan.summary.split("\n")[0].replace("Trigger: ", "")
                : "manual trigger"}
            </span>
          </div>

          <h2 style={{ marginTop: 16 }}>Steps</h2>
          {result.plan.steps.map((s, i) => (
            <div className="step" key={s.id}>
              <span className="mono" style={{ color: "#9aa1ab" }}>
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>{s.label}</span>
              <span className={`badge ${s.riskLevel}`}>{s.riskLevel}</span>
            </div>
          ))}

          <h2 style={{ marginTop: 16 }}>Why this plan</h2>
          <p style={{ color: "#c9cdd3", fontSize: 14 }}>{result.rationale}</p>

          {result.plan.requiresApproval && (
            <p style={{ fontSize: 13, color: "#d29922" }}>
              ⚠ This plan includes a medium/high-risk step. It will pause and wait for your explicit
              approval before that step runs, every time.
            </p>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={activate} disabled={activating}>
              {activating ? "Activating…" : "Review & Activate"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
