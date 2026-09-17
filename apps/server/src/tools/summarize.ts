import type { LlmProvider, ToolDefinition } from "@automation/core";

interface Input {
  text: string;
  instruction?: string;
}
interface Output {
  summary: string;
  provider: string;
}

export function createSummarizeTool(provider: LlmProvider): ToolDefinition<Input, Output> {
  return {
    name: "summarize_text",
    description: "Summarize a block of text using the configured AI provider.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        instruction: { type: "string" },
      },
    },
    async run(input) {
      if (!input.text || input.text.trim().length === 0) {
        return { summary: "(no content to summarize)", provider: provider.name };
      }
      const summary = await provider.complete([
        {
          role: "system",
          content:
            input.instruction ??
            "Summarize the following content in 3-6 concise bullet points, focused on what changed or is important.",
        },
        { role: "user", content: input.text },
      ]);
      return { summary, provider: provider.name };
    },
  };
}
