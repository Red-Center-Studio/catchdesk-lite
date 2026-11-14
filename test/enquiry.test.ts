import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Browser, location, pngFile, setSettings } from "./helpers";

const valid = {
  customerName: "Jamie Carter",
  customerEmail: "jamie@example.com",
  customerPhone: "",
  description: "Back door is sticking and the lock barely turns.",
  address: "14 Willow Lane",
  urgency: "urgent",
  preferredTime: "Mornings",
  consent: "1",
};

const count = async () => (await env.DB.prepare("SELECT count(*) AS n FROM lead").first<{ n: number }>())?.n ?? 0;

describe("public enquiry form", () => {
  it("shows the form with the business intro and the active services", async () => {
    await setSettings("business_name = 'Brightside', enquiry_intro = 'Tell us about the job.'");
    await env.DB.prepare(
      "INSERT INTO service (id, name, base_price_cents, active, sort) VALUES (?, 'Gutter clean', 14000, 1, 0), (?, 'Hidden one', 0, 0, 1)",
    )
      .bind(crypto.randomUUID(), crypto.randomUUID())
      .run();
    const res = await new Browser().get("/enquire");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Tell us about the job.");
    expect(html).toContain("Gutter clean");
    expect(html).not.toContain("Hidden one");
    expect(html).not.toContain('name="robots"');
  });

  it("saves an enquiry with photos and numbers leads in order", async () => {
    const b = new Browser();
    const res = await b.post("/enquire", { ...valid, photos: [pngFile("a.png"), pngFile("b.png")] });
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/enquire/thanks");
    const row = await env.DB.prepare("SELECT * FROM lead").first();
    expect(row).toMatchObject({
      number: 1001,
      status: "new",
      source: "form",
      urgency: "urgent",
      customer_name: "Jamie Carter",
    });
    expect(String(row?.public_token)).toMatch(/^[a-f0-9]{64}$/);
    const photos = await env.DB.prepare("SELECT key FROM lead_photo").all<{ key: string }>();
    expect(photos.results).toHaveLength(2);
    expect((await env.PHOTOS.list()).objects).toHaveLength(2);
    await b.post("/enquire", valid);
    expect((await env.DB.prepare("SELECT max(number) AS n FROM lead").first<{ n: number }>())?.n).toBe(1002);
  });

  it("needs a way to reply, a description and consent", async () => {
    const b = new Browser();
    const noContact = await b.post("/enquire", { ...valid, customerEmail: "" });
    expect(noContact.status).toBe(400);
    expect(await noContact.text()).toContain("Add an email or a phone number");
    const noConsent = await b.post("/enquire", { ...valid, consent: "" });
    expect(await noConsent.text()).toContain("Tick the box to agree");
    expect(await count()).toBe(0);
  });

  it("keeps what the customer typed when the form has a problem", async () => {
    const res = await new Browser().post("/enquire", { ...valid, customerEmail: "not-an-email" });
    const html = await res.text();
    expect(html).toContain("Enter a valid email.");
    expect(html).toContain("Back door is sticking");
  });

  it("quietly drops bot submissions that fill the trap field", async () => {
    const res = await new Browser().post("/enquire", { ...valid, website: "http://spam.example" });
    expect(res.status).toBe(303);
    expect(await count()).toBe(0);
  });

  it("refuses files that are not images, and more than six photos", async () => {
    const b = new Browser();
    const text = new File(["hello"], "notes.txt", { type: "text/plain" });
    const bad = await b.post("/enquire", { ...valid, photos: [text] });
    expect(await bad.text()).toContain("Photos must be JPEG, PNG, WebP or HEIC");
    const many = await b.post("/enquire", { ...valid, photos: Array.from({ length: 7 }, () => pngFile()) });
    expect(await many.text()).toContain("Add 6 photos at most.");
    expect(await count()).toBe(0);
  });

  it("refuses a post without the CSRF token or from another site", async () => {
    const b = new Browser();
    expect((await b.post("/enquire", valid, { csrf: false })).status).toBe(403);
    expect((await b.post("/enquire", valid, { origin: "https://evil.example" })).status).toBe(403);
    expect(await count()).toBe(0);
  });
});
