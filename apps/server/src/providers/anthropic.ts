import type { LlmMessage, LlmProvider } from "@automation/core";

export function createAnthropicProvider(apiKey: string): LlmProvider {
  return {
    name: "anthropic",
    isLocal: false,
    async complete(messages: LlmMessage[], opts) {
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
          model: "claude-3-5-haiku-20241022",
          system,
          messages: rest.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: opts?.maxTokens ?? 800,
          temperature: opts?.temperature ?? 0.2,
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic provider error: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as any;
      return data.content?.[0]?.text ?? "";
    },
  };
}
