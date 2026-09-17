import { describe, it, expect } from "vitest";
import { localProvider } from "../providers/local.js";
import { planFromText } from "../agents/planner.js";

describe("planFromText", () => {
  it("builds a website-monitor plan from a URL + schedule + notify request", async () => {
    const { plan } = await planFromText({
      text: "Every day at 8am check https://example.com and notify me if anything changed",
      provider: localProvider,
    });
    expect(plan.trigger).toEqual({ type: "schedule", cron: "0 8 * * *" });
    expect(plan.steps.map((s) => s.tool)).toEqual([
      "http_fetch_extract",
      "diff_snapshot",
      "summarize_text",
      "notify",
    ]);
    expect(plan.requiresApproval).toBe(true); // notify is high risk
  });

  it("builds a low-risk plan with no approval requirement when there's no notify", async () => {
    const { plan } = await planFromText({
      text: "check https://example.com daily",
      provider: localProvider,
    });
    expect(plan.requiresApproval).toBe(false);
    expect(plan.steps.every((s) => s.riskLevel === "low")).toBe(true);
  });

  it("builds a file-organize plan flagged as medium risk", async () => {
    const { plan } = await planFromText({
      text: "organize files in folder downloads",
      provider: localProvider,
    });
    expect(plan.steps[0].tool).toBe("file_organize");
    expect(plan.steps[0].riskLevel).toBe("medium");
    expect(plan.requiresApproval).toBe(true);
  });

  it("falls back to a manual-review plan when nothing matches", async () => {
    const { plan } = await planFromText({
      text: "make me a sandwich",
      provider: localProvider,
    });
    expect(plan.steps[0].kind).toBe("approval");
    expect(plan.title).toBe("Manual review needed");
  });
});
