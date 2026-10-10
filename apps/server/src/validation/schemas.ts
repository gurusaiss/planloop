import { z } from "zod";

// Bounds are deliberately generous but finite — this is about rejecting
// garbage/hostile input, not about being restrictive for legitimate use.
export const planRequestSchema = z.object({
  text: z.string().trim().min(1, "text must not be empty").max(2000, "text is too long (max 2000 chars)"),
});

const riskLevel = z.enum(["low", "medium", "high"]);
const stepKind = z.enum(["tool", "condition", "loop", "delay", "approval", "notify", "parallel"]);

// condition/loop/parallel/delay fields are accepted in the shape but are
// not executed by the engine yet (see docs/WORKFLOWS.md) — validated
// loosely here rather than with full recursive schemas since the planner
// never emits them today.
const workflowStepSchema = z.object({
  id: z.string().min(1),
  kind: stepKind,
  tool: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  riskLevel,
  label: z.string().min(1).max(500),
  condition: z.string().max(500).optional(),
  thenSteps: z.array(z.unknown()).max(50).optional(),
  elseSteps: z.array(z.unknown()).max(50).optional(),
  forEach: z.string().max(500).optional(),
  body: z.array(z.unknown()).max(50).optional(),
  maxIterations: z.number().int().min(1).max(1000).optional(),
  branches: z.array(z.unknown()).max(20).optional(),
  delayMs: z.number().int().min(0).max(300000).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  timeoutMs: z.number().int().min(1).max(600000).optional(),
  continueOnError: z.boolean().optional(),
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

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const passwordSchema = z
  .string()
  .min(10, "password must be at least 10 characters")
  .max(200, "password is too long");

export const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: passwordSchema,
  name: z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(500),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(500),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Workspaces & members
// ---------------------------------------------------------------------------

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const workspaceRole = z.enum(["owner", "admin", "member", "viewer"]);

export const inviteMemberSchema = z.object({
  email: z.string().trim().email().max(254),
  role: workspaceRole.exclude(["owner"]).default("member"),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(500),
});

export const updateMemberRoleSchema = z.object({
  role: workspaceRole,
});

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Provider configs
// ---------------------------------------------------------------------------

export const upsertProviderConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "local"]),
  apiKey: z.string().min(1).max(500).optional(),
  model: z.string().max(100).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const updateUserStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

export const updateUserSystemRoleSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});
