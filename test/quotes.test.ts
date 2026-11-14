import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Browser, location, makeLead, setSettings, signedIn } from "./helpers";

const token = async (id: string) =>
  (await env.DB.prepare("SELECT public_token FROM lead WHERE id = ?").bind(id).first<{ public_token: string }>())
    ?.public_token ?? "";
const leadRow = async (id: string) => env.DB.prepare("SELECT * FROM lead WHERE id = ?").bind(id).first();

/** Staff saves a quote with two lines, then sends it. */
async function sendQuote(browser: Browser, id: string) {
  return browser.post(`/leads/${id}/send`, {
    quoteSummary: "Replace the tap washer.",
    "desc[]": ["Call-out fee", "Tap washer and labour", ""],
    "qty[]": ["1", "1.5", "1"],
    "price[]": ["60", "80", ""],
  });
}

describe("building and sending a quote", () => {
  it("saves lines and skips blank rows", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    const res = await browser.post(`/leads/${l.id}/quote`, {
      quoteSummary: "Summary",
      "desc[]": ["Labour", "Parts", ""],
      "qty[]": ["2", "1", "1"],
      "price[]": ["75.50", "20", ""],
    });
    expect(res.status).toBe(303);
    const items = await env.DB.prepare("SELECT * FROM quote_item WHERE lead_id = ? ORDER BY sort").bind(l.id).all();
    expect(items.results.map((r) => [r.description, r.qty_hundredths, r.unit_cents])).toEqual([
      ["Labour", 200, 7550],
      ["Parts", 100, 2000],
    ]);
  });

  it("explains a bad price instead of saving", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    const res = await browser.post(`/leads/${l.id}/quote`, {
      "desc[]": ["Labour"],
      "qty[]": ["1"],
      "price[]": ["lots"],
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Line 1: price must be an amount");
  });

  it("sends: status, total with tax, expiry date and a timeline entry", async () => {
    await setSettings("tax_rate_bp = 1000, prices_include_tax = 0, quote_valid_days = 14");
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    const res = await sendQuote(browser, l.id);
    expect(res.status).toBe(303);
    expect(location(res)).toContain("m=sent_noemail");
    const row = await leadRow(l.id);
    // 60 + 1.5 x 80 = 180, plus 10% tax = 198.
    expect(row).toMatchObject({ status: "quoted", total_cents: 19800 });
    expect(String(row?.quote_valid_until)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const events = await env.DB.prepare("SELECT text FROM lead_event WHERE lead_id = ?")
      .bind(l.id)
      .all<{ text: string }>();
    expect(events.results.map((e) => e.text).join(" ")).toContain("Quote sent for $198.00");
  });

  it("will not send an empty or zero quote", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    const empty = await browser.post(`/leads/${l.id}/send`, { "desc[]": [""] });
    expect(await empty.text()).toContain("Add at least one line");
    const zero = await browser.post(`/leads/${l.id}/send`, {
      "desc[]": ["Free look"],
      "qty[]": ["1"],
      "price[]": ["0"],
    });
    expect(await zero.text()).toContain("The quote total is zero");
  });

  it("offers saved services as quick picks with their usual price", async () => {
    await env.DB.prepare("INSERT INTO service (id, name, base_price_cents) VALUES (?, 'Tap repair', 9500)")
      .bind(crypto.randomUUID())
      .run();
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    const html = await (await browser.get(`/leads/${l.id}`)).text();
    expect(html).toContain('value="Tap repair" data-price="95"');
  });
});

describe("the customer's quote page", () => {
  it("is not visible until the quote is sent, and unknown tokens are not found", async () => {
    const l = await makeLead();
    const visitor = new Browser();
    expect((await visitor.get(`/q/${await token(l.id)}`)).status).toBe(404);
    expect((await visitor.get(`/q/${"a".repeat(64)}`)).status).toBe(404);
    expect((await visitor.get("/q/short")).status).toBe(404);
  });

  it("shows the quote lines and total to the customer", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    await sendQuote(browser, l.id);
    const page = await new Browser().get(`/q/${await token(l.id)}`);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain("Replace the tap washer.");
    expect(html).toContain("Tap washer and labour");
    expect(html).toContain("$180.00");
  });

  it("accepts, works the total out on the server and runs only once", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    await sendQuote(browser, l.id);
    const t = await token(l.id);
    const customer = new Browser();
    const res = await customer.post(`/q/${t}/accept`, {
      acceptedName: "Casey Customer",
      customerReply: "Tuesday works",
      agree: "1",
      total: "1",
    });
    expect(res.status).toBe(303);
    expect(location(res)).toBe(`/q/${t}?m=accepted`);
    const row = await leadRow(l.id);
    expect(row).toMatchObject({
      status: "accepted",
      total_cents: 18000,
      accepted_name: "Casey Customer",
      customer_reply: "Tuesday works",
    });
    const again = await customer.post(`/q/${t}/accept`, { acceptedName: "Casey", agree: "1" });
    expect(again.status).toBe(409);
    // Staff can no longer change an accepted quote.
    const edit = await browser.post(`/leads/${l.id}/quote`, {
      "desc[]": ["Cheaper"],
      "qty[]": ["1"],
      "price[]": ["1"],
    });
    expect(await edit.text()).toContain("already accepted");
  });

  it("needs a name and the tick box to accept", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    await sendQuote(browser, l.id);
    const res = await new Browser().post(`/q/${await token(l.id)}/accept`, { acceptedName: "Casey" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Tick the box to accept");
  });

  it("refuses to accept an expired quote", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    await sendQuote(browser, l.id);
    await env.DB.prepare("UPDATE lead SET quote_valid_until = '2020-01-01' WHERE id = ?").bind(l.id).run();
    const t = await token(l.id);
    expect(await (await new Browser().get(`/q/${t}`)).text()).toContain("This quote has expired");
    const res = await new Browser().post(`/q/${t}/accept`, { acceptedName: "Casey", agree: "1" });
    expect(res.status).toBe(409);
  });

  it("lets the customer decline with a reason, which closes the lead", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    await sendQuote(browser, l.id);
    const res = await new Browser().post(`/q/${await token(l.id)}/decline`, { customerReply: "Too dear" });
    expect(res.status).toBe(303);
    expect(await leadRow(l.id)).toMatchObject({
      status: "lost",
      lost_reason: "Declined by customer",
      customer_reply: "Too dear",
    });
  });

  it("shows the booked visit on the quote page once staff book it", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    await sendQuote(browser, l.id);
    const t = await token(l.id);
    await new Browser().post(`/q/${t}/accept`, { acceptedName: "Casey", agree: "1" });
    await browser.post(`/leads/${l.id}/book`, { scheduledFor: "2027-04-02T10:00" });
    expect((await leadRow(l.id))?.status).toBe("booked");
    expect(await (await new Browser().get(`/q/${t}`)).text()).toContain("Your visit is booked for");
  });
});
