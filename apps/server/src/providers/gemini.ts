import type { LlmCompletion, LlmMessage, LlmProvider } from "@automation/core";

const DEFAULT_MODEL = "gemini-1.5-flash";

export function createGeminiProvider(apiKey: string, defaultModel = DEFAULT_MODEL): LlmProvider {
  return {
    name: "gemini",
    isLocal: false,
    async complete(messages: LlmMessage[], opts): Promise<LlmCompletion> {
      const model = opts?.model ?? defaultModel;
      const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: opts?.signal,
        }
      );
      if (!res.ok) {
        throw new Error(`Gemini provider error: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as any;
      return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        model,
        tokensIn: data.usageMetadata?.promptTokenCount,
        tokensOut: data.usageMetadata?.candidatesTokenCount,
      };
    },
  };
}
