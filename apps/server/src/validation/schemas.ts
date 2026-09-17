import { z } from "zod";

// Bounds are deliberately generous but finite — this is about rejecting
// garbage/hostile input, not about being restrictive for legitimate use.
export const planRequestSchema = z.object({
  text: z.string().trim().min(1, "text must not be empty").max(2000, "text is too long (max 2000 chars)"),
});

const riskLevel = z.enum(["low", "medium", "high"]);
const stepKind = z.enum(["tool", "condition", "loop", "delay", "approval", "notify"]);

const workflowStepSchema = z.object({
  id: z.string().min(1),
  kind: stepKind,
  tool: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  riskLevel,
  label: z.string().min(1).max(500),
  condition: z.string().optional(),
  onErrorStepId: z.string().optional(),
});

const workflowTriggerSchema = z.object({
  type: z.enum(["manual", "schedule", "webhook"]),
  cron: z.string().max(100).optional(),
  timezone: z.string().max(100).optional(),
});

export const workflowPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  summary: z.string().max(5000),
  trigger: workflowTriggerSchema,
  steps: z.array(workflowStepSchema).min(1).max(50),
  requiresApproval: z.boolean(),
  createdBy: z.enum(["ai", "human"]),
});

export const createAutomationSchema = z.object({
  plan: workflowPlanSchema,
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});
