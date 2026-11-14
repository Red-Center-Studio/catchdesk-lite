import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signedIn } from "./helpers";

const settings = () => env.DB.prepare("SELECT * FROM app_settings WHERE id = 1").first();

describe("settings", () => {
  it("saves currency, tax and quote validity", async () => {
    const { browser } = await signedIn("admin");
    const res = await browser.post("/settings/pricing", {
      currency: "AUD",
      taxLabel: "GST",
      taxRate: "10",
      pricesIncludeTax: "1",
      quoteValidDays: "21",
    });
    expect(res.status).toBe(303);
    expect(await settings()).toMatchObject({
      currency: "AUD",
      tax_label: "GST",
      tax_rate_bp: 1000,
      prices_include_tax: 1,
      quote_valid_days: 21,
    });
  });

  it("rejects a bad quote validity and a bad time zone", async () => {
    const { browser } = await signedIn("admin");
    const days = await browser.post("/settings/pricing", { currency: "USD", taxRate: "", quoteValidDays: "999" });
    expect(await days.text()).toContain("Quote valid for must be between 1 and 365.");
    const tz = await browser.post("/settings/business", { businessName: "Acme", timeZone: "Mars/Olympus" });
    expect(await tz.text()).toContain("Choose a time zone from the list.");
  });

  it("saves the enquiry form intro and new enquiry alerts", async () => {
    const { browser } = await signedIn("admin");
    await browser.post("/settings/form", { enquiryIntro: "Tell us about the job." });
    expect(await settings()).toMatchObject({ enquiry_intro: "Tell us about the job.", notify_new_lead: 0 });
  });

  it("adds, edits, hides, orders and deletes services, and adds a ready-made list", async () => {
    const { browser } = await signedIn("admin");
    await browser.post("/settings/services", { name: "Gutter clean", basePrice: "140" });
    await browser.post("/settings/services", { name: "Deep clean", basePrice: "" });
    const rows = async () =>
      (
        await env.DB.prepare("SELECT id, name, base_price_cents, active FROM service ORDER BY sort").all<{
          id: string;
          name: string;
          base_price_cents: number;
          active: number;
        }>()
      ).results;
    const [gutter, deep] = await rows();
    expect(gutter).toMatchObject({ name: "Gutter clean", base_price_cents: 14000, active: 1 });
    await browser.post(`/settings/services/${deep?.id}/move`, { direction: "up" });
    expect((await rows())[0]?.name).toBe("Deep clean");
    await browser.post(`/settings/services/${gutter?.id}/toggle`);
    expect((await rows()).find((r) => r.id === gutter?.id)?.active).toBe(0);
    await browser.post(`/settings/services/${gutter?.id}`, {
      name: "Gutter and roof",
      basePrice: "150",
    });
    expect((await rows()).find((r) => r.id === gutter?.id)?.name).toBe("Gutter and roof");
    await browser.post(`/settings/services/${deep?.id}/delete`);
    expect(await rows()).toHaveLength(1);
    await browser.post("/settings/services/template", { template: "outdoor" });
    expect((await rows()).length).toBe(5);
  });

  it("approves, changes and removes team members, but never the last admin", async () => {
    const { browser, user: me } = await signedIn("admin");
    const { user: newbie } = await signedIn(null, "New Person");
    await browser.post(`/settings/team/${newbie.id}`, { role: "staff" });
    const role = async (id: string) =>
      (await env.DB.prepare("SELECT role FROM user WHERE id = ?").bind(id).first<{ role: string | null }>())?.role;
    expect(await role(newbie.id)).toBe("staff");
    await browser.post(`/settings/team/${newbie.id}/remove`);
    expect(await role(newbie.id)).toBeNull();
    const self = await browser.post(`/settings/team/${me.id}/remove`);
    expect(await self.text()).toContain("You cannot remove your own access.");
  });
});
