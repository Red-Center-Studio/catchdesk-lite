/**
 * Captures the README screenshots from a running local copy with the demo data loaded.
 *
 *   npm run seed:local
 *   npx wrangler dev --port 8790        (in another terminal)
 *   npm run screenshots
 *
 * Uses Microsoft Edge by default; set PW_CHANNEL=chrome to use Chrome instead.
 */
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { DEMO_PASSWORD, DEMO_QUOTE_TOKEN } from "../src/seed/demo.ts";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8790";
const OUT = new URL("../docs/screenshots/", import.meta.url);

async function signedIn(browser: Browser, email: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

const shot = (page: Page, name: string) => page.screenshot({ path: fileURLToPath(new URL(name, OUT)) });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const phone = { width: 390, height: 844 };
const desktop = { width: 1100, height: 800 };

// The customer's side: the enquiry form and a quote, on a phone.
const visitor = await (await browser.newContext({ viewport: phone, deviceScaleFactor: 2 })).newPage();
await visitor.goto(`${BASE}/enquire`);
await shot(visitor, "enquiry-phone.png");
await visitor.goto(`${BASE}/q/${DEMO_QUOTE_TOKEN}`);
await shot(visitor, "quote-phone.png");

// The business side: Today on a phone, the inbox and a lead on a desktop.
const staff = await signedIn(browser, "staff@demo.catchdesk.example", phone);
await staff.goto(`${BASE}/today`);
await shot(staff, "today-phone.png");

const owner = await signedIn(browser, "owner@demo.catchdesk.example", desktop);
await owner.goto(`${BASE}/leads`);
await shot(owner, "leads-desktop.png");
await owner.getByRole("link", { name: /Chris Nguyen/ }).click();
// Show the quote builder, just under the sticky header. (A string, because this script is type-checked for Node.)
await owner.evaluate(`(() => {
  const header = document.querySelector("header").getBoundingClientRect().height;
  const quote = document.getElementById("quote");
  window.scrollTo(0, quote.getBoundingClientRect().top + window.scrollY - header - 16);
})()`);
await shot(owner, "lead-desktop.png");

await browser.close();
console.log("Screenshots saved to docs/screenshots.");
