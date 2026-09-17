import type { LlmMessage, LlmProvider } from "@automation/core";

export function createGeminiProvider(apiKey: string): LlmProvider {
  return {
    name: "gemini",
    isLocal: false,
    async complete(messages: LlmMessage[]) {
      const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      if (!res.ok) {
        throw new Error(`Gemini provider error: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    },
  };
}
