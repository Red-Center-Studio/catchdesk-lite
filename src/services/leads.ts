import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import {
  lead,
  leadEvent,
  leadPhoto,
  quoteItem,
  type AppSettings,
  type Lead,
  type LeadEvent,
  type LeadPhoto,
  type QuoteItem,
} from "../db/schema";
import type { AppUser } from "../env";
import { can } from "../lib/can";
import { formatMoney, totals, type Totals } from "../lib/money";
import { randomToken } from "../lib/photos";
import { addDays, ymdInZone } from "../lib/time";
import type { QuoteLineInput } from "../lib/validate";
import { LEAD_STATUSES, OPEN_STATUSES, statusLabel, type LeadSource, type LeadStatus, type Urgency } from "../labels";
import { nextLeadNumber, type Result } from "./settings";

const NOT_ALLOWED = "Your role cannot do that.";
const GONE = "That lead no longer exists.";
const nowIso = () => new Date().toISOString();

export interface NewLead {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceId: string | null;
  serviceName: string;
  description: string;
  address: string;
  urgency: Urgency;
  preferredTime: string;
  source: LeadSource;
}

/** Saves a new lead (from the public form or typed in by staff) with its photo keys and a first timeline entry. */
export async function createLead(
  db: DB,
  d1: D1Database,
  input: NewLead,
  photoKeys: string[],
  actorName: string,
): Promise<Lead> {
  const id = crypto.randomUUID();
  const number = await nextLeadNumber(d1);
  const at = nowIso();
  await db.insert(lead).values({
    id,
    number,
    publicToken: randomToken(),
    status: "new",
    ...input,
    createdAt: at,
    updatedAt: at,
  });
  if (photoKeys.length > 0) {
    await db.insert(leadPhoto).values(photoKeys.map((key) => ({ id: crypto.randomUUID(), leadId: id, key })));
  }
  await addEvent(
    db,
    id,
    "created",
    input.source === "form" ? "Enquiry received from the website form." : "Lead added.",
    actorName,
  );
  const row = await db.select().from(lead).where(eq(lead.id, id)).get();
  if (!row) throw new Error("lead not saved");
  return row;
}

export async function addEvent(db: DB, leadId: string, kind: string, text: string, actorName = ""): Promise<void> {
  await db.insert(leadEvent).values({ id: crypto.randomUUID(), leadId, kind, text, actorName });
}

// ---------- Reading ----------

export const PAGE_SIZE = 25;

export interface InboxFilter {
  status: LeadStatus | "open" | "all";
  q?: string | undefined;
  page: number;
}

export async function listLeads(db: DB, actor: AppUser, f: InboxFilter): Promise<{ rows: Lead[]; total: number }> {
  if (!can(actor, "lead:view")) return { rows: [], total: 0 };
  const conds = [];
  if (f.status === "open") conds.push(inArray(lead.status, [...OPEN_STATUSES]));
  else if (f.status !== "all") conds.push(eq(lead.status, f.status));
  if (f.q) {
    const term = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const n = Number(f.q.replace(/^#/, ""));
    conds.push(
      or(
        sql`${lead.customerName} LIKE ${term} ESCAPE '\\'`,
        sql`${lead.customerEmail} LIKE ${term} ESCAPE '\\'`,
        sql`${lead.customerPhone} LIKE ${term} ESCAPE '\\'`,
        sql`${lead.address} LIKE ${term} ESCAPE '\\'`,
        sql`${lead.description} LIKE ${term} ESCAPE '\\'`,
        ...(Number.isInteger(n) && n > 0 ? [eq(lead.number, n)] : []),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  // Open work: the oldest unanswered first is the fairest order, but urgent jobs jump the queue.
  const rows = await db
    .select()
    .from(lead)
    .where(where)
    .orderBy(
      sql`CASE ${lead.status} WHEN 'new' THEN 0 WHEN 'accepted' THEN 1 WHEN 'needs_info' THEN 2 WHEN 'quoted' THEN 3 WHEN 'booked' THEN 4 ELSE 5 END`,
      sql`CASE ${lead.urgency} WHEN 'urgent' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END`,
      desc(lead.createdAt),
    )
    .limit(PAGE_SIZE)
    .offset((f.page - 1) * PAGE_SIZE)
    .all();
  const count = await db
    .select({ n: sql<number>`count(*)` })
    .from(lead)
    .where(where)
    .get();
  return { rows, total: count?.n ?? 0 };
}

/** How many leads sit in each status, for the inbox tabs. */
export async function statusCounts(db: DB): Promise<Record<LeadStatus, number>> {
  const rows = await db
    .select({ status: lead.status, n: sql<number>`count(*)` })
    .from(lead)
    .groupBy(lead.status)
    .all();
  const out = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export interface LeadDetail {
  lead: Lead;
  items: QuoteItem[];
  photos: LeadPhoto[];
  events: LeadEvent[];
}

export async function getLead(db: DB, leadId: string): Promise<LeadDetail | null> {
  const row = await db.select().from(lead).where(eq(lead.id, leadId)).get();
  if (!row) return null;
  const [items, photos, events] = await Promise.all([
    db.select().from(quoteItem).where(eq(quoteItem.leadId, leadId)).orderBy(asc(quoteItem.sort)).all(),
    db.select().from(leadPhoto).where(eq(leadPhoto.leadId, leadId)).orderBy(asc(leadPhoto.createdAt)).all(),
    db.select().from(leadEvent).where(eq(leadEvent.leadId, leadId)).orderBy(desc(leadEvent.createdAt)).all(),
  ]);
  return { lead: row, items, photos, events };
}

/** Finds a lead by the secret token in a customer's quote link. */
export async function getLeadByToken(db: DB, token: string): Promise<LeadDetail | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await db.select({ id: lead.id }).from(lead).where(eq(lead.publicToken, token)).get();
  return row ? getLead(db, row.id) : null;
}

export function quoteTotals(items: QuoteItem[], settings: AppSettings): Totals {
  return totals(items, settings);
}

// ---------- Working a lead ----------

async function requireLead(db: DB, leadId: string): Promise<Lead | null> {
  return (await db.select().from(lead).where(eq(lead.id, leadId)).get()) ?? null;
}

export async function setStatus(
  db: DB,
  actor: AppUser,
  leadId: string,
  status: LeadStatus,
  lostReason = "",
): Promise<Result> {
  if (!can(actor, "lead:work")) return { ok: false, message: NOT_ALLOWED };
  const row = await requireLead(db, leadId);
  if (!row) return { ok: false, message: GONE };
  if (row.status === status && status !== "lost") return { ok: true };
  const at = nowIso();
  await db
    .update(lead)
    .set({
      status,
      lostReason: status === "lost" ? lostReason || row.lostReason : "",
      doneAt: status === "done" ? at : row.doneAt,
      updatedAt: at,
    })
    .where(eq(lead.id, leadId));
  await addEvent(
    db,
    leadId,
    "status",
    `Marked ${statusLabel[status].toLowerCase()}${status === "lost" && lostReason ? `: ${lostReason}` : ""}.`,
    actor.name,
  );
  return { ok: true };
}

export async function saveNotes(db: DB, actor: AppUser, leadId: string, notes: string): Promise<Result> {
  if (!can(actor, "lead:work")) return { ok: false, message: NOT_ALLOWED };
  const res = await db.update(lead).set({ internalNotes: notes, updatedAt: nowIso() }).where(eq(lead.id, leadId)).run();
  return res.meta.changes ? { ok: true } : { ok: false, message: GONE };
}

export async function addNote(db: DB, actor: AppUser, leadId: string, text: string): Promise<Result> {
  if (!can(actor, "lead:work")) return { ok: false, message: NOT_ALLOWED };
  if (!(await requireLead(db, leadId))) return { ok: false, message: GONE };
  await addEvent(db, leadId, "note", text, actor.name);
  return { ok: true };
}

export async function book(db: DB, actor: AppUser, leadId: string, scheduledFor: string | null): Promise<Result> {
  if (!can(actor, "lead:work")) return { ok: false, message: NOT_ALLOWED };
  const row = await requireLead(db, leadId);
  if (!row) return { ok: false, message: GONE };
  if (row.status === "lost" || row.status === "done") {
    return { ok: false, message: "This lead is closed. Reopen it before booking." };
  }
  const status: LeadStatus = scheduledFor ? "booked" : row.status === "booked" ? "accepted" : row.status;
  await db.update(lead).set({ scheduledFor, status, updatedAt: nowIso() }).where(eq(lead.id, leadId));
  await addEvent(
    db,
    leadId,
    "booked",
    scheduledFor ? `Booked for ${scheduledFor.replace("T", " ")}.` : "Booking cleared.",
    actor.name,
  );
  return { ok: true };
}

/** Deletes a lead with its quote, timeline and photos. Returns the photo keys so the caller can remove them. */
export async function deleteLead(db: DB, actor: AppUser, leadId: string): Promise<Result<string[]>> {
  if (!can(actor, "lead:delete")) return { ok: false, message: "Only an admin can delete a lead." };
  const photos = await db.select({ key: leadPhoto.key }).from(leadPhoto).where(eq(leadPhoto.leadId, leadId)).all();
  await db.delete(lead).where(eq(lead.id, leadId));
  return { ok: true, value: photos.map((p) => p.key) };
}

// ---------- Quotes ----------

/** Replaces the quote lines and summary. Allowed until the customer accepts. */
export async function saveQuote(
  db: DB,
  actor: AppUser,
  leadId: string,
  summary: string,
  lines: QuoteLineInput[],
): Promise<Result> {
  if (!can(actor, "lead:work")) return { ok: false, message: NOT_ALLOWED };
  const row = await requireLead(db, leadId);
  if (!row) return { ok: false, message: GONE };
  if (row.acceptedAt) {
    return { ok: false, message: "The customer already accepted this quote, so it cannot be changed." };
  }
  const at = nowIso();
  await db.delete(quoteItem).where(eq(quoteItem.leadId, leadId));
  if (lines.length > 0) {
    await db.insert(quoteItem).values(
      lines.map((l, i) => ({
        id: crypto.randomUUID(),
        leadId,
        description: l.description,
        qtyHundredths: l.qtyHundredths,
        unitCents: l.unitCents,
        sort: i,
        createdAt: at,
        updatedAt: at,
      })),
    );
  }
  await db.update(lead).set({ quoteSummary: summary, updatedAt: at }).where(eq(lead.id, leadId));
  return { ok: true };
}

/**
 * Marks the quote as sent: sets the valid-until date and stores the total. Sending again
 * (after a change) is fine; the customer's link stays the same.
 */
export async function markQuoteSent(
  db: DB,
  actor: AppUser,
  leadId: string,
  settings: AppSettings,
  timeZone: string,
  now = new Date(),
): Promise<Result<LeadDetail>> {
  if (!can(actor, "lead:work")) return { ok: false, message: NOT_ALLOWED };
  const detail = await getLead(db, leadId);
  if (!detail) return { ok: false, message: GONE };
  const { lead: row, items } = detail;
  if (row.acceptedAt) return { ok: false, message: "The customer already accepted this quote." };
  if (row.status === "lost" || row.status === "done") {
    return { ok: false, message: "This lead is closed. Reopen it before sending a quote." };
  }
  if (items.length === 0) return { ok: false, message: "Add at least one line to the quote first." };
  const t = totals(items, settings);
  if (t.totalCents <= 0) return { ok: false, message: "The quote total is zero. Add prices first." };
  const validUntil = addDays(ymdInZone(now, timeZone), settings.quoteValidDays);
  await db
    .update(lead)
    .set({
      status: "quoted",
      quoteSentAt: now.toISOString(),
      quoteValidUntil: validUntil,
      totalCents: t.totalCents,
      updatedAt: now.toISOString(),
    })
    .where(eq(lead.id, leadId));
  await addEvent(
    db,
    leadId,
    "quote_sent",
    `Quote sent for ${formatMoney(t.totalCents, settings.currency)}.`,
    actor.name,
  );
  const fresh = await getLead(db, leadId);
  return fresh ? { ok: true, value: fresh } : { ok: false, message: GONE };
}

/** True when the quote's valid-until day has passed in the business time zone. */
export function quoteExpired(row: Pick<Lead, "quoteValidUntil">, timeZone: string, now = new Date()): boolean {
  return Boolean(row.quoteValidUntil && row.quoteValidUntil < ymdInZone(now, timeZone));
}

/**
 * The customer accepts on their quote page. The total is worked out again on the server from the stored prices
 * (never from the browser). Runs only once per quote.
 */
export async function acceptQuote(
  db: DB,
  detail: LeadDetail,
  settings: AppSettings,
  input: { acceptedName: string; customerReply: string },
  timeZone: string,
  now = new Date(),
): Promise<Result<Totals>> {
  const row = detail.lead;
  if (row.acceptedAt) return { ok: false, message: "This quote was already accepted. Thank you." };
  if (row.status !== "quoted" || !row.quoteSentAt) return { ok: false, message: "This quote is not open right now." };
  if (quoteExpired(row, timeZone, now)) {
    return { ok: false, message: "This quote has expired. Contact us for an updated one." };
  }
  const t = totals(detail.items, settings);
  const at = now.toISOString();
  // The status condition makes a double click (or two tabs) accept only once.
  const res = await db
    .update(lead)
    .set({
      status: "accepted",
      acceptedAt: at,
      acceptedName: input.acceptedName,
      customerReply: input.customerReply,
      totalCents: t.totalCents,
      updatedAt: at,
    })
    .where(and(eq(lead.id, row.id), eq(lead.status, "quoted"), sql`${lead.acceptedAt} IS NULL`))
    .run();
  if (!res.meta.changes) return { ok: false, message: "This quote was already answered." };
  await addEvent(
    db,
    row.id,
    "accepted",
    `Accepted by ${input.acceptedName}.${input.customerReply ? ` Message: ${input.customerReply}` : ""}`,
    input.acceptedName,
  );
  return { ok: true, value: t };
}

export async function declineQuote(db: DB, detail: LeadDetail, reply: string): Promise<Result> {
  const row = detail.lead;
  if (row.status !== "quoted" || row.acceptedAt) return { ok: false, message: "This quote is not open right now." };
  const res = await db
    .update(lead)
    .set({
      status: "lost",
      lostReason: "Declined by customer",
      customerReply: reply,
      updatedAt: nowIso(),
    })
    .where(and(eq(lead.id, row.id), eq(lead.status, "quoted")))
    .run();
  if (!res.meta.changes) return { ok: false, message: "This quote was already answered." };
  await addEvent(db, row.id, "declined", `Customer declined.${reply ? ` Message: ${reply}` : ""}`, row.customerName);
  return { ok: true };
}

// ---------- Today board ----------

export interface TodayBoard {
  needsReply: Lead[];
  toBook: Lead[];
  awaiting: Lead[];
  upcoming: Lead[];
}

export async function todayBoard(db: DB, timeZone: string, now = new Date()): Promise<TodayBoard> {
  const today = ymdInZone(now, timeZone);
  const [needsReply, toBook, awaiting, upcoming] = await Promise.all([
    db
      .select()
      .from(lead)
      .where(eq(lead.status, "new"))
      .orderBy(sql`CASE ${lead.urgency} WHEN 'urgent' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END`, asc(lead.createdAt))
      .limit(20)
      .all(),
    db.select().from(lead).where(eq(lead.status, "accepted")).orderBy(asc(lead.acceptedAt)).limit(20).all(),
    db.select().from(lead).where(eq(lead.status, "quoted")).orderBy(asc(lead.quoteSentAt)).limit(20).all(),
    db
      .select()
      .from(lead)
      .where(and(eq(lead.status, "booked"), sql`${lead.scheduledFor} >= ${today}`))
      .orderBy(asc(lead.scheduledFor))
      .limit(20)
      .all(),
  ]);
  return { needsReply, toBook, awaiting, upcoming };
}
