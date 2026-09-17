import * as cheerio from "cheerio";
import type { ToolDefinition } from "@automation/core";
import { assertPublicUrl } from "./ssrfGuard.js";

interface Input {
  url: string;
  /** Optional CSS selector to scope extraction; defaults to <body> text. */
  selector?: string;
}

interface Output {
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
}

export const httpFetchTool: ToolDefinition<Input, Output> = {
  name: "http_fetch_extract",
  description: "Fetch a public web page and extract its readable text content.",
  riskLevel: "low",
  inputSchema: {
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string" },
      selector: { type: "string" },
    },
  },
  async run(input) {
    const parsed = await assertPublicUrl(input.url);

    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "AutomationPlatform/0.1 (+local)" },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();

    const scope = input.selector ? $(input.selector) : $("body");
    const text = scope
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000); // cap to keep downstream LLM calls cheap/predictable

    return {
      url: parsed.toString(),
      title: $("title").text().trim(),
      text,
      fetchedAt: new Date().toISOString(),
    };
  },
};
