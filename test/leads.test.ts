import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ALL_ACTIONS, can } from "../src/lib/can";
import { Browser, location, makeLead, pngFile, signedIn } from "./helpers";

describe("permissions", () => {
  it("staff work leads; only admins change settings, delete leads and manage the team; pending users do nothing", () => {
    const staff = { id: "s", role: "staff" as const };
    const admin = { id: "a", role: "admin" as const };
    const pending = { id: "p", role: null };
    expect(can(staff, "lead:work")).toBe(true);
    for (const a of ["settings:edit", "lead:delete", "team:manage"] as const) {
      expect(can(staff, a)).toBe(false);
      expect(can(admin, a)).toBe(true);
    }
    for (const a of ALL_ACTIONS) expect(can(pending, a)).toBe(false);
    expect(can(null, "lead:view")).toBe(false);
  });

  it("sends signed-out visitors to sign in, and pending users to the waiting page", async () => {
    const res = await new Browser().get("/leads");
    expect(res.status).toBe(303);
    expect(location(res)).toContain("/login?next=%2Fleads");
    const { browser } = await signedIn(null);
    expect(location(await browser.get("/today"))).toBe("/waiting");
  });

  it("blocks staff from settings and deleting, on the server", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    expect((await browser.get("/settings")).status).toBe(403);
    expect((await browser.post("/settings/pricing", { currency: "USD", quoteValidDays: "5" })).status).toBe(403);
    expect((await browser.post(`/leads/${l.id}/delete`)).status).toBe(403);
  });

  it("the first account on a fresh deploy becomes the admin", async () => {
    const b = new Browser();
    await b.post("/signup", { fullName: "First Owner", email: "owner@example.com", password: "correct-horse-battery" });
    const row = await env.DB.prepare("SELECT role FROM user WHERE email = 'owner@example.com'").first<{
      role: string;
    }>();
    expect(row?.role).toBe("admin");
  });
});

describe("working leads", () => {
  it("adds a lead from a phone call with a photo, and shows it on the detail page", async () => {
    const { browser, user } = await signedIn("staff", "Priya");
    const res = await browser.post("/leads/new", {
      customerName: "Daniel Okafor",
      customerPhone: "(555) 330-9182",
      source: "phone",
      urgency: "soon",
      description: "Three ceiling fans",
      photos: [pngFile()],
    });
    expect(res.status).toBe(303);
    const page = await browser.get(location(res));
    const html = await page.text();
    expect(html).toContain("Daniel Okafor");
    expect(html).toContain("Lead saved.");
    expect(html).toContain("Lead added.");
    expect(html).toContain(user.name);
    const photo = await env.DB.prepare("SELECT id FROM lead_photo").first<{ id: string }>();
    const img = await browser.get(`/photos/lead/${photo?.id}`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    // Not for signed-out visitors.
    expect((await new Browser().get(`/photos/lead/${photo?.id}`)).status).toBe(303);
  });

  it("lists open leads with status tabs, newest urgent first, and searches", async () => {
    const { browser } = await signedIn("staff");
    await makeLead({ customerName: "Flexible Fran" });
    await makeLead({ customerName: "Urgent Uma", urgency: "urgent" });
    const done = await makeLead({ customerName: "Finished Fred" });
    await env.DB.prepare("UPDATE lead SET status = 'done' WHERE id = ?").bind(done.id).run();
    const html = await (await browser.get("/leads")).text();
    expect(html.indexOf("Urgent Uma")).toBeLessThan(html.indexOf("Flexible Fran"));
    expect(html).not.toContain("Finished Fred");
    expect(await (await browser.get("/leads?status=done")).text()).toContain("Finished Fred");
    const search = await (await browser.get("/leads?status=all&q=fran")).text();
    expect(search).toContain("Flexible Fran");
    expect(search).not.toContain("Urgent Uma");
    // Wildcards are treated as plain text.
    expect(await (await browser.get("/leads?status=all&q=%25")).text()).toContain("No leads match");
  });

  it("changes status with a lost reason", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    await browser.post(`/leads/${l.id}/status`, { status: "lost", lostReason: "Price too high" });
    const row = await env.DB.prepare("SELECT status, lost_reason FROM lead WHERE id = ?").bind(l.id).first();
    expect(row).toEqual({ status: "lost", lost_reason: "Price too high" });
    const bad = await browser.post(`/leads/${l.id}/status`, { status: "won" });
    expect(bad.status).toBe(400);
  });

  it("saves private notes and timeline notes", async () => {
    const { browser } = await signedIn("staff");
    const l = await makeLead();
    await browser.post(`/leads/${l.id}/notes`, { internalNotes: "Dog in the yard" });
    await browser.post(`/leads/${l.id}/event`, { text: "Left a voicemail" });
    const html = await (await browser.get(`/leads/${l.id}`)).text();
    expect(html).toContain("Dog in the yard");
    expect(html).toContain("Left a voicemail");
  });

  it("lets an admin delete a lead and its photos", async () => {
    const { browser } = await signedIn("admin");
    const add = await browser.post("/leads/new", {
      customerName: "Gone Soon",
      customerPhone: "5551234567",
      source: "phone",
      urgency: "flexible",
      photos: [pngFile()],
    });
    const id = location(add).split("/")[2]?.split("?")[0] ?? "";
    expect((await env.PHOTOS.list()).objects).toHaveLength(1);
    expect(location(await browser.post(`/leads/${id}/delete`))).toBe("/leads");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM lead").first<{ n: number }>()).toEqual({ n: 0 });
    expect((await env.PHOTOS.list()).objects).toHaveLength(0);
  });

  it("shows the Today board", async () => {
    const { browser } = await signedIn("staff");
    await makeLead({ customerName: "Needs Reply Nia" });
    const today = await (await browser.get("/today")).text();
    expect(today).toContain("Needs a reply");
    expect(today).toContain("Needs Reply Nia");
    expect(today).toContain("/enquire");
  });

  it("returns not found for a made-up lead id", async () => {
    const { browser } = await signedIn("staff");
    expect((await browser.get(`/leads/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await browser.get("/leads/not-an-id")).status).toBe(404);
  });
});
