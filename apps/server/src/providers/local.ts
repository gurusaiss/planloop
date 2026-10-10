import type { LlmCompletion, LlmMessage, LlmProvider } from "@automation/core";

/**
 * Zero-cost, zero-network fallback provider. It never leaves the machine.
 * It is not a real language model — it does simple extractive summarization
 * so the product still works end-to-end with no API keys configured.
 * Real providers (OpenAI/Anthropic/Gemini) are used automatically once a
 * matching API key is present (env or workspace provider config).
 */
export const localProvider: LlmProvider = {
  name: "local-heuristic",
  isLocal: true,
  async complete(messages: LlmMessage[]): Promise<LlmCompletion> {
    const last = messages[messages.length - 1]?.content ?? "";
    // Heuristic "summarizer": take the first N sentences that contain the
    // most distinctive (non-stopword) tokens. Deterministic and offline.
    const sentences = last
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 20);

    if (sentences.length === 0) {
      return { text: last.slice(0, 400), model: "local-heuristic" };
    }

    const stop = new Set([
      "the","a","an","and","or","but","of","to","in","on","for","is","are",
      "was","were","with","that","this","it","as","by","at","from","be","has",
      "have","will","its","their","which","also",
    ]);

    const score = (s: string) =>
      s
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3 && !stop.has(w)).length;

    const ranked = [...sentences]
      .map((s, i) => ({ s, i, score: score(s) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .sort((a, b) => a.i - b.i);

    return { text: ranked.map((r) => r.s).join(" "), model: "local-heuristic" };
  },
};
