import type { ToolDefinition } from "@automation/core";
import { chromium } from "playwright";
import { assertPublicUrl } from "./ssrfGuard.js";

interface Input {
  url: string;
  selector?: string;
  waitForMs?: number;
}
interface Output {
  url: string;
  text: string;
  fetchedAt: string;
}

let browserSingleton: import("playwright").Browser | null = null;
async function getBrowser() {
  if (!browserSingleton) {
    browserSingleton = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    });
  }
  return browserSingleton;
}

/**
 * Real browser automation via Playwright — used for JavaScript-rendered
 * pages that a plain HTTP fetch can't read. Runs fully locally/headless;
 * no external browser-automation service or API key is required.
 */
export const browserSnapshotTool: ToolDefinition<Input, Output> = {
  name: "browser_snapshot",
  description: "Load a page in a real (headless) browser and extract its rendered text. Use for JS-heavy sites.",
  riskLevel: "low",
  inputSchema: {
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string" },
      selector: { type: "string" },
      waitForMs: { type: "number" },
    },
  },
  async run(input) {
    const parsed = await assertPublicUrl(input.url);

    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(parsed.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
      if (input.waitForMs) await page.waitForTimeout(Math.min(input.waitForMs, 10000));

      const text = input.selector
        ? await page.locator(input.selector).innerText()
        : await page.locator("body").innerText();

      return {
        url: parsed.toString(),
        text: text.replace(/\s+/g, " ").trim().slice(0, 20000),
        fetchedAt: new Date().toISOString(),
      };
    } finally {
      await context.close();
    }
  },
};

export async function closeBrowser() {
  if (browserSingleton) {
    await browserSingleton.close();
    browserSingleton = null;
  }
}
