import type { LlmMessage, LlmProvider } from "@automation/core";

export function createOpenAiProvider(apiKey: string): LlmProvider {
  return {
    name: "openai",
    isLocal: false,
    async complete(messages: LlmMessage[], opts) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          max_tokens: opts?.maxTokens ?? 800,
          temperature: opts?.temperature ?? 0.2,
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenAI provider error: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as any;
      return data.choices?.[0]?.message?.content ?? "";
    },
  };
}
