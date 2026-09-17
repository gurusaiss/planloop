import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();

await page.goto("http://localhost:3000/");

// New: the app now requires a bearer token before showing anything else.
await page.waitForSelector('input[type="password"]', { timeout: 10000 });
await page.fill('input[type="password"]', process.env.ADMIN_TOKEN ?? "demo-token-abcdefghijklmnop");
await page.getByRole("button", { name: "Connect" }).click();
await page.waitForSelector("text=What do you want automated?", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-0-authed.png", fullPage: true });

await page.fill("textarea", "Every day at 8am check https://pypi.org/ and notify me if anything changed");
await page.click("text=Generate plan");
await page.waitForSelector("text=Review & Activate", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-1-plan.png", fullPage: true });

await page.click("text=Review & Activate");
await page.waitForURL(/\/automations\//, { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-2-automation.png", fullPage: true });

await page.click("text=Run now");
await page.waitForURL(/\/runs\//, { timeout: 10000 });
await page.waitForSelector("text=Approval required", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-3-pending-approval.png", fullPage: true });

await page.click("text=Approve & continue");
await page.waitForSelector("text=succeeded", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-4-succeeded.png", fullPage: true });

console.log("UI smoke test passed");
await browser.close();
