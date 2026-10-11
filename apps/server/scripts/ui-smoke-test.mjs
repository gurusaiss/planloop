import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();
page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));

const rand = Math.random().toString(36).slice(2);
const email = `owner_${rand}@example.com`;
const password = "a-very-strong-password";

// --- Register (becomes the instance owner — first user in a fresh DB) ---
await page.goto("http://localhost:3000/register");
await page.fill("#name", "Ada Lovelace");
await page.fill("input[type='email']", email);
await page.fill("input[type='password']", password);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForSelector("text=What do you want automated?", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-1-dashboard.png", fullPage: true });
console.log("✓ register -> dashboard");

// --- Core loop: describe -> plan -> activate -> run -> approve ---
await page.fill("textarea", "organize files in folder smoketest-inbox");
await page.getByRole("button", { name: "Generate plan" }).click();
await page.waitForSelector("text=Review & Activate", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-2-plan.png", fullPage: true });
console.log("✓ plan generated");

await page.getByRole("button", { name: "Review & Activate" }).click();
await page.waitForURL(/\/automations\//, { timeout: 10000 });
console.log("✓ automation activated");

await page.getByRole("button", { name: "Run now" }).click();
await page.waitForURL(/\/runs\//, { timeout: 10000 });
await page.waitForSelector("text=Approval required", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-3-approval.png", fullPage: true });
console.log("✓ run paused for approval");

await page.getByRole("button", { name: "Approve & continue" }).click();
await page.waitForSelector("text=succeeded", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-4-succeeded.png", fullPage: true });
console.log("✓ run succeeded");

// --- Settings: profile ---
await page.goto("http://localhost:3000/settings/profile");
await page.waitForSelector("text=Change password", { timeout: 10000 });
console.log("✓ profile settings loaded");

// --- Settings: workspace & invite ---
await page.goto("http://localhost:3000/settings/workspace");
await page.waitForSelector("text=Members", { timeout: 10000 });
await page.fill("input[type='email']", `teammate_${rand}@example.com`);
await page.getByRole("button", { name: "Send invite" }).click();
await page.waitForSelector("text=/Invite emailed|Email not sent/", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-5-workspace.png", fullPage: true });
console.log("✓ workspace invite sent (honest no-SMTP fallback shown)");

// --- Settings: API keys ---
await page.goto("http://localhost:3000/settings/api-keys");
await page.fill("input[placeholder*='Key name']", "smoke-test-key");
await page.getByRole("button", { name: "Create key" }).click();
await page.waitForSelector("text=Copy this now", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-6-apikey.png", fullPage: true });
console.log("✓ API key created");

// --- Settings: providers ---
await page.goto("http://localhost:3000/settings/providers");
await page.waitForSelector("text=Local (free", { timeout: 10000 });
console.log("✓ providers settings loaded");

// --- Admin panel (this user is the instance owner) ---
await page.goto("http://localhost:3000/admin");
await page.waitForSelector("text=Pending approval", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-7-admin-overview.png", fullPage: true });
console.log("✓ admin overview loaded");

await page.getByRole("button", { name: "users", exact: true }).click();
await page.waitForSelector("text=Ada Lovelace", { timeout: 10000 });
await page.screenshot({ path: "/tmp/ui-8-admin-users.png", fullPage: true });
console.log("✓ admin users tab loaded");

// --- Notifications page ---
await page.goto("http://localhost:3000/notifications");
await page.waitForSelector("h1:has-text('Notifications')", { timeout: 10000 });
console.log("✓ notifications page loaded");

// --- Logout ---
await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL(/\/login/, { timeout: 10000 });
console.log("✓ logout redirects to login");

// --- Confirm protected route redirects when logged out ---
await page.goto("http://localhost:3000/automations");
await page.waitForURL(/\/login/, { timeout: 10000 });
console.log("✓ protected route redirects unauthenticated user to login");

console.log("\nALL UI SMOKE CHECKS PASSED");
await browser.close();
