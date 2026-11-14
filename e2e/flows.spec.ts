import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { DEMO_QUOTE_TOKEN } from "../src/seed/demo.ts";

// The whole journey in a real browser: a customer sends an enquiry, staff quote it, the customer accepts and the
// owner books it in. Every page is also checked with axe for WCAG 2.2 AA problems and for sideways scrolling.

async function checkPage(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
}

// Each project (desktop, phone) sends its own enquiry, so the name carries the project.
const nameFor = (project: string) => `E2E ${project} customer`;

test.describe.configure({ mode: "serial" });

test("a customer sends an enquiry", async ({ page }, info) => {
  await page.goto("/enquire");
  await checkPage(page);
  await page.getByLabel("Your name").fill(nameFor(info.project.name));
  await page.getByLabel("Email").fill("e2e@example.com");
  await page.getByLabel("What do you need?").selectOption({ label: "Gutter clean" });
  await page.getByLabel("Describe the job").fill("Single storey gutters, front and back.");
  await page.getByLabel("Urgent, as soon as possible").check();
  await page.getByLabel("You can contact me about this enquiry.").check();
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("heading", { name: "Thanks, we have your enquiry" })).toBeVisible();
  await checkPage(page);
});

test.describe("staff", () => {
  test.use({ storageState: ".e2e-state/staff.json" });

  test("Today and the inbox pass the accessibility checks", async ({ page }, info) => {
    await page.goto("/today");
    await expect(page.getByText(nameFor(info.project.name)).first()).toBeVisible();
    await checkPage(page);
    await page.goto("/leads");
    await checkPage(page);
  });

  test("builds and sends a quote", async ({ page }, info) => {
    await page.goto("/leads");
    await page
      .getByRole("link", { name: new RegExp(nameFor(info.project.name)) })
      .first()
      .click();
    await checkPage(page);
    const blanks = page.locator("[data-line]").filter({ has: page.locator("input[placeholder^='Add a line']") });
    // Picking a saved service fills in its usual price.
    const first = blanks.first();
    await first.locator("input[name='desc[]']").fill("Gutter clean");
    await first.locator("input[name='desc[]']").dispatchEvent("change");
    await expect(first.locator("input[name='price[]']")).toHaveValue("140");
    const second = blanks.nth(1);
    await second.locator("input[name='desc[]']").fill("Downpipe flush");
    await second.locator("input[name='price[]']").fill("45");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Save and send quote" }).click();
    await expect(page.getByText("Customer's quote link")).toBeVisible();
  });
});

test("the customer accepts the quote", async ({ page, browser }, info) => {
  const name = nameFor(info.project.name);
  const staff = await browser.newContext({ storageState: ".e2e-state/staff.json" });
  const staffPage = await staff.newPage();
  await staffPage.goto("/leads?status=quoted");
  await staffPage
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  const link = (await staffPage.locator("code").filter({ hasText: "/q/" }).first().textContent()) ?? "";
  await staff.close();

  await page.goto(new URL(link).pathname);
  await checkPage(page);
  await expect(page.getByText("$185.00").first()).toBeVisible();
  await page.getByLabel("Your full name").fill(name);
  await page.getByLabel("I accept this quote and the total shown.").check();
  await page.getByRole("button", { name: "Accept quote" }).click();
  await expect(page.getByText("Thank you. Your quote is accepted.")).toBeVisible();
});

test.describe("owner", () => {
  test.use({ storageState: ".e2e-state/admin.json" });

  test("books the accepted job and checks Settings", async ({ page }, info) => {
    await page.goto("/leads?status=accepted");
    await page
      .getByRole("link", { name: new RegExp(nameFor(info.project.name)) })
      .first()
      .click();
    await page.getByLabel("Booked for").fill("2030-06-01T09:00");
    await page.getByRole("button", { name: "Book it in" }).click();
    await expect(page.getByText("Booking saved.")).toBeVisible();
    await page.goto("/settings");
    await checkPage(page);
  });
});

test("the sample quote and sign-in page pass the accessibility checks", async ({ page }) => {
  await page.goto(`/q/${DEMO_QUOTE_TOKEN}`);
  await checkPage(page);
  await page.goto("/");
  await checkPage(page);
});
