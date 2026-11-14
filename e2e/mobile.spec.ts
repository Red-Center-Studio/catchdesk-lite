import { expect, test, type Page } from "@playwright/test";
import { DEMO_QUOTE_TOKEN } from "../src/seed/demo.ts";

// Phone checks on every main screen, run at 375px and 390px wide: no sideways page scroll, tap targets at least
// 44px, text no smaller than 12px, and email and phone fields that bring up the right keyboard.

async function phoneProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 1) problems.push(`page scrolls sideways by ${overflow}px`);

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        !el.closest(".sr-only, [hidden], dialog:not([open])")
      );
    };
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.textContent || el.getAttribute("aria-label") || el.getAttribute("name") || "").trim().slice(0, 40)}"`;

    // Links inside a sentence are exempt from the target size rule (WCAG 2.5.8 inline exception).
    const inline = (el: Element) => el.tagName === "A" && !!el.closest("p, li p, dd, td p, .prose, label");
    for (const el of document.querySelectorAll("a[href], button, select, textarea, input, summary")) {
      if (!visible(el) || inline(el)) continue;
      const input = el as HTMLInputElement;
      if (el.tagName === "INPUT" && input.type === "hidden") continue;
      // Checkboxes, radios and file inputs are tapped through their label: measure that.
      const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
      const target = el.tagName === "INPUT" && ["checkbox", "radio"].includes(input.type) ? (label ?? el) : el;
      const r = target.getBoundingClientRect();
      if (r.height < 43.5) problems.push(`tap target ${Math.round(r.height)}px tall: ${describe(target)}`);
      if (r.width < 43.5) problems.push(`tap target ${Math.round(r.width)}px wide: ${describe(target)}`);
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const small = new Set<Element>();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || !visible(el)) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.add(el);
    }
    for (const el of small) problems.push(`text under 12px: ${describe(el)}`);

    for (const el of document.querySelectorAll<HTMLInputElement>("input[name]")) {
      const n = el.name.toLowerCase();
      if (/email/.test(n) && el.type !== "email") problems.push(`${n} is type ${el.type}, not email`);
      if (/phone/.test(n) && el.type !== "tel") problems.push(`${n} is type ${el.type}, not tel`);
    }
    return problems;
  });
}

async function check(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBeLessThan(400);
  const problems = await phoneProblems(page);
  expect(problems, `${path}\n${problems.join("\n")}`).toEqual([]);
}

test.describe("public pages on a phone", () => {
  for (const path of [
    "/enquire",
    `/q/${DEMO_QUOTE_TOKEN}`,
    "/login",
    "/signup",
    "/forgot-password",
    "/privacy",
    "/terms",
  ]) {
    test(path, async ({ page }) => check(page, path));
  }
});

for (const role of ["admin", "staff"] as const) {
  test.describe(`${role} screens on a phone`, () => {
    test.use({ storageState: `.e2e-state/${role}.json` });
    const paths = ["/today", "/leads", "/leads?status=quoted", "/leads/new", "/waiting", "/account"];
    if (role === "admin") paths.push("/settings");
    for (const path of paths) {
      test(path, async ({ page }) => check(page, path));
    }
    test("a lead and its quote editor", async ({ page }) => {
      await page.goto("/leads");
      const href = await page
        .locator('a[href^="/leads/"]:not([href="/leads/new"]):not([href*="export"])')
        .first()
        .getAttribute("href");
      expect(href).toBeTruthy();
      await check(page, href ?? "/leads");
    });
  });
}
