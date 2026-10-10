import type { LlmCompletion, LlmMessage, LlmProvider } from "@automation/core";

const DEFAULT_MODEL = "gpt-4o-mini";

export function createOpenAiProvider(apiKey: string, defaultModel = DEFAULT_MODEL): LlmProvider {
  return {
    name: "openai",
    isLocal: false,
    async complete(messages: LlmMessage[], opts): Promise<LlmCompletion> {
      const model = opts?.model ?? defaultModel;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: opts?.maxTokens ?? 800,
          temperature: opts?.temperature ?? 0.2,
        }),
        signal: opts?.signal,
      });
      if (!res.ok) {
        throw new Error(`OpenAI provider error: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as any;
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        model,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
      };
    },
  };
}
