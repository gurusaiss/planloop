import { v4 as uuid } from "uuid";
import type { LlmProvider, PlannerResult, WorkflowPlan, WorkflowStep } from "@automation/core";
import { parseSchedule } from "./scheduleParser.js";

const URL_REGEX = /https?:\/\/[^\s)]+/gi;

/**
 * Planner Agent.
 *
 * Design decision (see docs/AGENTS.md): step construction is deterministic
 * and rule-based, not "ask the LLM to emit JSON and hope it's valid". This
 * is the platform's core reliability bet — an LLM hallucinating a tool
 * name or a malformed input schema would silently break a workflow. The
 * LLM (when a real provider is configured) is used only for the
 * human-facing title/summary/rationale text, never to decide which tools
 * run with which inputs. New templates get added by extending this file's
 * `detectTemplate` step, not by trusting free-form model output.
 */
export async function planFromText(input: {
  text: string;
  provider: LlmProvider;
}): Promise<PlannerResult> {
  const { text, provider } = input;
  const urls = [...new Set(text.match(URL_REGEX) ?? [])];
  const schedule = parseSchedule(text);
  const wantsNotify = /notify|email|alert|tell me|let me know/i.test(text);
  const wantsOrganize = /organi[sz]e/i.test(text) && /file/i.test(text);

  let steps: WorkflowStep[] = [];
  let title: string;
  let templateUsed: string;

  if (wantsOrganize) {
    templateUsed = "file_organize";
    title = "Organize files";
    steps = [
      step("organize", "tool", "file_organize", "medium", "Organize files into folders by type", {
        sourceDir: extractFolder(text) ?? "inbox",
        rules: {
          documents: ["pdf", "doc", "docx", "txt"],
          images: ["png", "jpg", "jpeg", "gif"],
          spreadsheets: ["csv", "xlsx"],
          archives: ["zip", "tar", "gz"],
        },
        dryRun: false,
      }),
    ];
  } else if (urls.length > 0) {
    templateUsed = "website_monitor";
    title = urls.length === 1 ? `Monitor ${hostOf(urls[0])}` : `Monitor ${urls.length} websites`;
    for (const [i, url] of urls.entries()) {
      steps.push(
        step(`fetch_${i}`, "tool", "http_fetch_extract", "low", `Open ${hostOf(url)} and read its content`, { url })
      );
      steps.push(
        step(`diff_${i}`, "tool", "diff_snapshot", "low", `Check whether ${hostOf(url)} changed since last run`, {
          key: url,
          content: `{{steps.fetch_${i}.output.text}}`,
        })
      );
    }
    steps.push(
      step("summarize", "tool", "summarize_text", "low", "Summarize what changed", {
        text: `{{joined:diff}}`,
        instruction: "Summarize what changed on the monitored page(s) in 3-5 bullet points. If nothing changed, say so plainly.",
      })
    );
    if (wantsNotify) {
      steps.push(
        step("notify", "notify", undefined, "high", "Notify the user with the summary", {
          subject: title,
          body: `{{steps.summarize.output.summary}}`,
        })
      );
    }
  } else {
    templateUsed = "unsupported";
    title = "Manual review needed";
    steps = [
      step(
        "unsupported",
        "approval",
        undefined,
        "medium",
        "This request didn't match a supported automation template yet (no URL, and not a file-organize request). Flagged for manual setup instead of guessing.",
        {}
      ),
    ];
  }

  const requiresApproval = steps.some((s) => s.riskLevel === "high" || s.riskLevel === "medium");

  const plan: WorkflowPlan = {
    id: `plan_${uuid()}`,
    title,
    summary: buildSummary(steps, schedule?.summary),
    trigger: schedule ? { type: "schedule", cron: schedule.cron } : { type: "manual" },
    steps,
    requiresApproval,
    createdBy: "ai",
  };

  const rationale = await buildRationale(provider, text, templateUsed, plan);

  return { plan, rationale };
}

function step(
  id: string,
  kind: WorkflowStep["kind"],
  tool: string | undefined,
  riskLevel: WorkflowStep["riskLevel"],
  label: string,
  input: Record<string, unknown>
): WorkflowStep {
  return { id, kind, tool: tool ?? (kind === "notify" ? "notify" : undefined), input, riskLevel, label };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function extractFolder(text: string): string | null {
  const m = text.match(/folder(?:\s+called|\s+named)?\s+["']?([\w\-./]+)["']?/i);
  return m ? m[1] : null;
}

function buildSummary(steps: WorkflowStep[], scheduleSummary?: string): string {
  const lines = steps.map((s, i) => `${i + 1}. ${s.label}`);
  return [scheduleSummary ? `Trigger: ${scheduleSummary}` : "Trigger: manual (run on demand)", ...lines].join("\n");
}

async function buildRationale(
  provider: LlmProvider,
  originalText: string,
  templateUsed: string,
  plan: WorkflowPlan
): Promise<string> {
  if (provider.isLocal) {
    return `Matched template "${templateUsed}" from keywords/URLs in your request. ${
      plan.requiresApproval
        ? "This plan includes a medium/high-risk step, so it will wait for your approval before running unattended."
        : "All steps are low-risk (read-only), so this can run without per-run approval once activated."
    }`;
  }
  try {
    return await provider.complete([
      {
        role: "system",
        content:
          "You explain, in 2-3 plain sentences, why a given automation plan matches the user's request. Do not invent steps that aren't listed.",
      },
      {
        role: "user",
        content: `User request: "${originalText}"\n\nPlanned steps:\n${plan.summary}\n\nExplain why this plan satisfies the request.`,
      },
    ]);
  } catch {
    return `Matched template "${templateUsed}".`;
  }
}
