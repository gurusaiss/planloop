import type { LlmCompletion, LlmMessage, LlmProvider } from "@automation/core";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export function createAnthropicProvider(apiKey: string, defaultModel = DEFAULT_MODEL): LlmProvider {
  return {
    name: "anthropic",
    isLocal: false,
    async complete(messages: LlmMessage[], opts): Promise<LlmCompletion> {
      const model = opts?.model ?? defaultModel;
      const system = messages.find((m) => m.role === "system")?.content;
      const rest = messages.filter((m) => m.role !== "system");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          system,
          messages: rest.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: opts?.maxTokens ?? 800,
          temperature: opts?.temperature ?? 0.2,
        }),
        signal: opts?.signal,
      });
      if (!res.ok) {
        throw new Error(`Anthropic provider error: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as any;
      return {
        text: data.content?.[0]?.text ?? "",
        model,
        tokensIn: data.usage?.input_tokens,
        tokensOut: data.usage?.output_tokens,
      };
    },
  };
}
