import type { LlmProvider } from "@automation/core";
import { localProvider } from "./local.js";
import { createOpenAiProvider } from "./openai.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createGeminiProvider } from "./gemini.js";

/**
 * Provider selection order: explicit AI_PROVIDER env var wins; otherwise the
 * first provider with a configured API key wins; otherwise fall back to the
 * local, zero-cost heuristic provider. This is the one place that knows
 * about concrete providers — everything else in the app only depends on the
 * LlmProvider interface, so adding a new provider means adding one file
 * here, not touching the agents/tools/routes.
 */
export function selectProvider(): LlmProvider {
  const requested = process.env.AI_PROVIDER?.toLowerCase();

  const available: Record<string, () => LlmProvider | null> = {
    openai: () =>
      process.env.OPENAI_API_KEY ? createOpenAiProvider(process.env.OPENAI_API_KEY) : null,
    anthropic: () =>
      process.env.ANTHROPIC_API_KEY
        ? createAnthropicProvider(process.env.ANTHROPIC_API_KEY)
        : null,
    gemini: () =>
      process.env.GEMINI_API_KEY ? createGeminiProvider(process.env.GEMINI_API_KEY) : null,
    local: () => localProvider,
  };

  if (requested && available[requested]) {
    const p = available[requested]();
    if (p) return p;
  }

  for (const key of ["openai", "anthropic", "gemini"]) {
    const p = available[key]();
    if (p) return p;
  }

  return localProvider;
}
