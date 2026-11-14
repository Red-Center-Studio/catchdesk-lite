/**
 * Demo data. Used by the nightly reset in demo mode and by `npm run seed:local` / `npm run seed:remote`.
 * Plain TypeScript with explicit .ts imports, so Node can run it directly for the seed script.
 * Never run this against a real business's database: it deletes everything first.
 */
import { hashPassword } from "../auth/password.ts";
import { totals } from "../lib/money.ts";

export const DEMO_PASSWORD = "catchdesk-lite-demo";

export const DEMO_ACCOUNTS = [
  { role: "admin", name: "Morgan Ellis", email: "owner@demo.catchdesk.example", label: "Owner" },
  { role: "staff", name: "Priya Shah", email: "staff@demo.catchdesk.example", label: "Staff" },
] as const;

/** A fixed token so the landing page can link straight to a sample customer quote. */
export const DEMO_QUOTE_TOKEN = "d3m0".padEnd(64, "0").replace(/[^a-f0-9]/g, "0");

export interface Statement {
  sql: string;
  params: (string | number | null)[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const SETTINGS = {
  taxRateBp: 0,
  pricesIncludeTax: false,
};

interface DemoLead {
  name: string;
  email: string;
  phone: string;
  address: string;
  service: number;
  description: string;
  urgency: "flexible" | "soon" | "urgent";
  status: "new" | "needs_info" | "quoted" | "accepted" | "booked" | "done" | "lost";
  ageHours: number;
  source: "form" | "phone" | "email" | "walk_in";
  preferred?: string;
  /** [description, qty in hundredths, unit cents] */
  items?: [string, number, number][];
  summary?: string;
  lostReason?: string;
  reply?: string;
  bookInDays?: number;
  token?: string;
}

/** [name, description, usual price in cents] */
const SERVICES: [string, string, number][] = [
  ["Repair or handyman visit", "Small repairs, doors, fittings and odd jobs.", 0],
  ["Fixture install", "Lights, fans, shelving, TV mounts and blinds.", 4500],
  ["Deep clean", "End of lease, move-in or one-off deep clean.", 18000],
  ["Gutter clean", "Single or double storey, with photos before and after.", 14000],
  ["Painting touch-up", "Patch, prime and paint walls, doors and trims.", 0],
];

const LEADS: DemoLead[] = [
  {
    name: "Jamie Carter",
    email: "jamie.carter@example.com",
    phone: "(555) 201-4410",
    address: "14 Willow Lane, Riverton",
    service: 0,
    description:
      "Back door is sticking badly and the lock barely turns. Hoping to get it sorted before the weekend. Photos of the frame attached.",
    urgency: "urgent",
    status: "new",
    ageHours: 2,
    source: "form",
    preferred: "Weekday mornings",
  },
  {
    name: "Sofia Martinez",
    email: "sofia.m@example.com",
    phone: "",
    address: "Unit 3, 88 Harbor Road",
    service: 2,
    description: "Moving out at the end of the month. Two bedroom apartment, one bathroom, carpets throughout.",
    urgency: "soon",
    status: "new",
    ageHours: 7,
    source: "form",
    preferred: "Any day after the 25th",
  },
  {
    name: "Daniel Okafor",
    email: "",
    phone: "(555) 330-9182",
    address: "201 Pine Street",
    service: 1,
    description:
      "Wants three ceiling fans installed, wiring already in place from old light fittings. Called from site.",
    urgency: "flexible",
    status: "new",
    ageHours: 20,
    source: "phone",
  },
  {
    name: "Hannah Lee",
    email: "hannah.lee@example.com",
    phone: "(555) 448-2201",
    address: "9 Ridge Court",
    service: 4,
    description: "Patch two holes in the hallway and repaint the wall. Not sure of the exact paint color.",
    urgency: "flexible",
    status: "needs_info",
    ageHours: 30,
    source: "form",
  },
  {
    name: "Chris Nguyen",
    email: "chris.nguyen@example.com",
    phone: "(555) 610-7731",
    address: "42 Elm Avenue",
    service: 3,
    description: "Two storey house, gutters overflowing at the back corner. Last cleaned over a year ago.",
    urgency: "soon",
    status: "quoted",
    ageHours: 50,
    source: "form",
    summary:
      "Clean all gutters and downpipes on a two storey house, clear the blocked back corner and flush the downpipes.",
    items: [
      ["Gutter clean, two storey", 100, 14000],
      ["Downpipe flush (each)", 300, 2500],
    ],
    token: DEMO_QUOTE_TOKEN,
  },
  {
    name: "Olivia Brooks",
    email: "olivia.b@example.com",
    phone: "",
    address: "7 Lakeview Drive",
    service: 1,
    description: "Mount a 65 inch TV on a plaster wall and hide the cables.",
    urgency: "flexible",
    status: "quoted",
    ageHours: 100,
    source: "email",
    summary: "Mount a 65 inch TV on a plasterboard wall with a tilting bracket and run the cables inside the wall.",
    items: [
      ["Call-out fee", 100, 6000],
      ["TV wall mount and in-wall cable kit", 100, 8500],
      ["Labour (hours)", 150, 7500],
    ],
  },
  {
    name: "Marcus Webb",
    email: "marcus.webb@example.com",
    phone: "(555) 772-0190",
    address: "55 Cedar Close",
    service: 2,
    description: "Deep clean before new tenants move in. Three bedrooms, oven included please.",
    urgency: "soon",
    status: "accepted",
    ageHours: 76,
    source: "form",
    summary:
      "Full deep clean of a three bedroom house, including the oven, bathrooms, windows inside and carpets vacuumed.",
    items: [
      ["Deep clean, three bedrooms", 100, 26000],
      ["Oven clean", 100, 6500],
      ["Carpet steam clean", 100, 12000],
    ],
    reply: "Thursday or Friday next week would be ideal.",
  },
  {
    name: "Aisha Rahman",
    email: "aisha.r@example.com",
    phone: "(555) 120-3344",
    address: "3 Orchard Way",
    service: 0,
    description: "Replace two internal door handles and fix a squeaky hinge.",
    urgency: "flexible",
    status: "booked",
    ageHours: 120,
    source: "phone",
    summary: "Replace two internal door handles with the matching set you chose and fix the squeaking hinge.",
    items: [
      ["Call-out fee", 100, 6000],
      ["Door handle set (each)", 200, 3500],
      ["Labour (hours)", 100, 7500],
    ],
    bookInDays: 2,
  },
  {
    name: "Ben Turner",
    email: "ben.t@example.com",
    phone: "",
    address: "120 Main Street",
    service: 3,
    description: "Single storey gutters, front and back.",
    urgency: "flexible",
    status: "done",
    ageHours: 300,
    source: "form",
    summary: "Clean front and back gutters on a single storey home.",
    items: [["Gutter clean, single storey", 100, 14000]],
  },
  {
    name: "Grace Kim",
    email: "grace.kim@example.com",
    phone: "(555) 909-1212",
    address: "18 Birch Road",
    service: 4,
    description: "Repaint a bedroom, walls only.",
    urgency: "flexible",
    status: "lost",
    ageHours: 400,
    source: "form",
    summary: "Repaint the walls of one bedroom in two coats of low sheen.",
    items: [
      ["Paint and materials", 100, 9000],
      ["Labour (hours)", 600, 7500],
    ],
    lostReason: "Declined by customer",
    reply: "Thanks, we have decided to do it ourselves.",
  },
];

/** Builds the statements that wipe the database and load the demo business, relative to `now`. */
export async function demoStatements(now = new Date()): Promise<Statement[]> {
  const out: Statement[] = [];
  const add = (sql: string, ...params: (string | number | null)[]) => out.push({ sql, params });
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const nowMs = now.getTime();

  for (const table of [
    "lead_event",
    "lead_photo",
    "quote_item",
    "lead",
    "service",
    "session",
    "account",
    "verification",
    "user",
  ]) {
    add(`DELETE FROM ${table}`);
  }
  add("INSERT OR IGNORE INTO app_settings (id) VALUES (1)");
  add(
    `UPDATE app_settings SET business_name = ?, support_email = '', phone = ?, show_setup_offer = 1, currency = 'USD',
     tax_label = 'Sales tax', tax_rate_bp = ?, prices_include_tax = ?, quote_valid_days = 30, notify_new_lead = 1,
     last_lead_number = ?, updated_at = ? WHERE id = 1`,
    "Brightside Home Services (demo)",
    "(555) 010-2026",
    SETTINGS.taxRateBp,
    SETTINGS.pricesIncludeTax ? 1 : 0,
    1000 + LEADS.length,
    now.toISOString(),
  );

  // People. The extra staff member has no demo sign-in; the pending one shows the approval flow.
  const people = [
    ...DEMO_ACCOUNTS.map((a) => ({ role: a.role, name: a.name, email: a.email, id: crypto.randomUUID() })),
    { role: "staff", name: "Tom Fisher", email: "tom@demo.catchdesk.example", id: crypto.randomUUID() },
    { role: null, name: "Riley Chen", email: "riley@demo.catchdesk.example", id: crypto.randomUUID() },
  ];
  const hash = await hashPassword(DEMO_PASSWORD);
  for (const [i, p] of people.entries()) {
    const created = nowMs - (60 - i) * DAY;
    add(
      "INSERT INTO user (id, full_name, email, email_verified, role, is_demo, created_at, updated_at) VALUES (?, ?, ?, 1, ?, 1, ?, ?)",
      p.id,
      p.name,
      p.email,
      p.role,
      created,
      created,
    );
    add(
      "INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)",
      crypto.randomUUID(),
      p.id,
      p.id,
      hash,
      created,
      created,
    );
  }
  const owner = people[0];
  const staff = people[1];

  const serviceIds = SERVICES.map(() => crypto.randomUUID());
  for (const [i, [name, description, price]] of SERVICES.entries()) {
    add(
      "INSERT INTO service (id, name, description, base_price_cents, active, sort, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
      serviceIds[i] ?? "",
      name,
      description,
      price,
      i,
      iso(60 * DAY),
      iso(60 * DAY),
    );
  }

  const ymdIn = (days: number) => new Date(nowMs + days * DAY).toISOString().slice(0, 10);
  for (const [i, l] of LEADS.entries()) {
    const id = crypto.randomUUID();
    const number = 1001 + i;
    const created = iso(l.ageHours * HOUR);
    const token =
      l.token ?? [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const items = (l.items ?? []).map(([description, qty, unit]) => ({
      description,
      qtyHundredths: qty,
      unitCents: unit,
    }));
    const t = totals(items, SETTINGS);
    const quoted = ["quoted", "accepted", "booked", "done", "lost"].includes(l.status) && items.length > 0;
    const sentAt = quoted ? iso((l.ageHours - 4) * HOUR) : null;
    const accepted = ["accepted", "booked", "done"].includes(l.status);
    const acceptedAt = accepted ? iso(Math.max(1, l.ageHours - 20) * HOUR) : null;
    const scheduled = l.bookInDays !== undefined ? `${ymdIn(l.bookInDays)}T09:00` : null;
    const svc = SERVICES[l.service];
    add(
      `INSERT INTO lead (id, number, public_token, status, source, customer_name, customer_email, customer_phone, address,
        service_id, service_name, description, urgency, preferred_time, scheduled_for, lost_reason, quote_summary,
        quote_valid_until, quote_sent_at, accepted_at, accepted_name, customer_reply, total_cents, done_at,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      number,
      token,
      l.status,
      l.source,
      l.name,
      l.email,
      l.phone,
      l.address,
      serviceIds[l.service] ?? null,
      svc?.[0] ?? "",
      l.description,
      l.urgency,
      l.preferred ?? "",
      scheduled,
      l.lostReason ?? "",
      l.summary ?? "",
      quoted ? ymdIn(26) : null,
      sentAt,
      acceptedAt,
      accepted ? l.name : "",
      l.reply ?? "",
      quoted ? t.totalCents : 0,
      l.status === "done" ? iso(48 * HOUR) : null,
      created,
      created,
    );
    for (const [s, item] of items.entries()) {
      add(
        "INSERT INTO quote_item (id, lead_id, description, qty_hundredths, unit_cents, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        id,
        item.description,
        item.qtyHundredths,
        item.unitCents,
        s,
        created,
        created,
      );
    }
    const event = (kind: string, text: string, at: string, actor: string) =>
      add(
        "INSERT INTO lead_event (id, lead_id, kind, text, actor_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        id,
        kind,
        text,
        actor,
        at,
        at,
      );
    event(
      "created",
      l.source === "form" ? "Enquiry received from the website form." : "Lead added.",
      created,
      l.source === "form" ? "" : (owner?.name ?? ""),
    );
    if (sentAt) event("quote_sent", `Quote sent for $${(t.totalCents / 100).toFixed(2)}.`, sentAt, owner?.name ?? "");
    if (acceptedAt)
      event("accepted", `Accepted by ${l.name}.${l.reply ? ` Message: ${l.reply}` : ""}`, acceptedAt, l.name);
    if (scheduled)
      event(
        "booked",
        `Booked for ${scheduled.replace("T", " ")}.`,
        iso(Math.max(1, l.ageHours - 30) * HOUR),
        owner?.name ?? "",
      );
    if (l.status === "lost")
      event("declined", `Customer declined.${l.reply ? ` Message: ${l.reply}` : ""}`, iso(100 * HOUR), l.name);
    if (l.status === "needs_info")
      event(
        "note",
        "Asked the customer for a photo of the wall and the paint can label.",
        iso((l.ageHours - 2) * HOUR),
        staff?.name ?? "",
      );
    if (l.status === "done") event("status", "Marked done.", iso(48 * HOUR), staff?.name ?? "");
  }
  return out;
}
