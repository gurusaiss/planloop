import type { LlmProvider } from "@automation/core";
import { db } from "../db/index.js";
import { decryptSecret } from "../lib/crypto.js";
import { localProvider } from "./local.js";
import { createOpenAiProvider } from "./openai.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createGeminiProvider } from "./gemini.js";

type ProviderKey = "openai" | "anthropic" | "gemini" | "local";

function build(provider: ProviderKey, apiKey: string | null, model?: string | null): LlmProvider | null {
  switch (provider) {
    case "openai":
      return apiKey ? createOpenAiProvider(apiKey, model ?? undefined) : null;
    case "anthropic":
      return apiKey ? createAnthropicProvider(apiKey, model ?? undefined) : null;
    case "gemini":
      return apiKey ? createGeminiProvider(apiKey, model ?? undefined) : null;
    case "local":
      return localProvider;
  }
}

/**
 * Instance-level fallback: explicit AI_PROVIDER env var wins; otherwise the
 * first provider with a configured API key wins; otherwise the local,
 * zero-cost heuristic provider. Used when a workspace hasn't configured its
 * own provider (see selectProviderForWorkspace).
 */
export function selectProvider(): LlmProvider {
  const requested = process.env.AI_PROVIDER?.toLowerCase() as ProviderKey | undefined;

  const envKey: Record<Exclude<ProviderKey, "local">, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };

  if (requested) {
    const p = build(requested, requested === "local" ? null : envKey[requested] ?? null);
    if (p) return p;
  }

  for (const key of ["openai", "anthropic", "gemini"] as const) {
    const p = build(key, envKey[key] ?? null);
    if (p) return p;
  }

  return localProvider;
}

/**
 * Per-workspace resolution: each workspace can configure its own provider +
 * API key (routes/providerConfigs.ts), stored encrypted. The workspace's
 * `is_default` enabled config wins; otherwise this falls back to the
 * instance-level `selectProvider()`. This is the one place the rest of the
 * app (planner, tools) needs to call — it never touches provider_configs
 * directly.
 */
export function selectProviderForWorkspace(workspaceId: string): LlmProvider {
  const row = db
    .prepare(
      `SELECT * FROM provider_configs WHERE workspace_id = ? AND enabled = 1 AND is_default = 1 LIMIT 1`
    )
    .get(workspaceId) as any;

  if (row) {
    const apiKey = row.api_key_encrypted ? decryptSecret(row.api_key_encrypted) : null;
    const provider = build(row.provider as ProviderKey, apiKey, row.model);
    if (provider) return provider;
  }

  return selectProvider();
}
