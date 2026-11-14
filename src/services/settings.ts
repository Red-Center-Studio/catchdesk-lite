import { asc, eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { appSettings, service, type AppSettings, type Service } from "../db/schema";
import type { AppUser } from "../env";
import { can } from "../lib/can";
import { SERVICE_TEMPLATES } from "../labels";

export type Result<T = undefined> = { ok: true; value?: T } | { ok: false; message: string };

const ADMIN_ONLY = "Only an admin can change settings.";

export async function getSettings(db: DB): Promise<AppSettings> {
  const row = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (row) return row;
  // The migration creates this row; recreate it if it was ever removed.
  await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
  const fresh = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!fresh) throw new Error("app_settings row missing");
  return fresh;
}

export async function updateSettings(
  db: DB,
  actor: AppUser,
  values: Partial<Omit<AppSettings, "id" | "createdAt" | "updatedAt" | "lastLeadNumber">>,
): Promise<Result> {
  if (!can(actor, "settings:edit")) return { ok: false, message: ADMIN_ONLY };
  if (actor.isDemo && "businessName" in values) {
    return { ok: false, message: "The demo business name cannot be changed. Everything else can." };
  }
  await db
    .update(appSettings)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(appSettings.id, 1));
  return { ok: true };
}

/** Hands out the next lead number in one statement, so two enquiries at once never share a number. */
export async function nextLeadNumber(d1: D1Database): Promise<number> {
  const row = await d1
    .prepare("UPDATE app_settings SET last_lead_number = last_lead_number + 1 WHERE id = 1 RETURNING last_lead_number")
    .first<{ last_lead_number: number }>();
  if (!row) throw new Error("app_settings row missing");
  return row.last_lead_number;
}

// ---------- Services ----------

export async function listServices(db: DB, activeOnly = false): Promise<Service[]> {
  const rows = await db.select().from(service).orderBy(asc(service.sort), asc(service.name)).all();
  return activeOnly ? rows.filter((s) => s.active) : rows;
}

export async function getService(db: DB, serviceId: string): Promise<Service | undefined> {
  return db.select().from(service).where(eq(service.id, serviceId)).get();
}

export interface ServiceInput {
  name: string;
  description: string;
  basePrice: number;
}

export async function addService(db: DB, actor: AppUser, input: ServiceInput): Promise<Result<string>> {
  if (!can(actor, "settings:edit")) return { ok: false, message: ADMIN_ONLY };
  const count = await db
    .select({ n: sql<number>`count(*)` })
    .from(service)
    .get();
  if ((count?.n ?? 0) >= 100) return { ok: false, message: "You can have 100 services at most." };
  const top = await db
    .select({ s: sql<number>`coalesce(max(${service.sort}), -1)` })
    .from(service)
    .get();
  const id = crypto.randomUUID();
  await db.insert(service).values({
    id,
    name: input.name,
    description: input.description,
    basePriceCents: input.basePrice,
    sort: (top?.s ?? -1) + 1,
  });
  return { ok: true, value: id };
}

export async function updateService(db: DB, actor: AppUser, serviceId: string, input: ServiceInput): Promise<Result> {
  if (!can(actor, "settings:edit")) return { ok: false, message: ADMIN_ONLY };
  const res = await db
    .update(service)
    .set({
      name: input.name,
      description: input.description,
      basePriceCents: input.basePrice,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(service.id, serviceId))
    .run();
  if (res.meta.changes === 0) return { ok: false, message: "That service no longer exists." };
  return { ok: true };
}

/** Hides a service from the enquiry form, or shows it again. Leads keep the service name they were made with. */
export async function toggleService(db: DB, actor: AppUser, serviceId: string): Promise<Result> {
  if (!can(actor, "settings:edit")) return { ok: false, message: ADMIN_ONLY };
  await db
    .update(service)
    .set({ active: sql`NOT ${service.active}`, updatedAt: new Date().toISOString() })
    .where(eq(service.id, serviceId));
  return { ok: true };
}

export async function deleteService(db: DB, actor: AppUser, serviceId: string): Promise<Result> {
  if (!can(actor, "settings:edit")) return { ok: false, message: ADMIN_ONLY };
  await db.delete(service).where(eq(service.id, serviceId));
  return { ok: true };
}

export async function moveService(
  db: DB,
  actor: AppUser,
  serviceId: string,
  direction: "up" | "down",
): Promise<Result> {
  if (!can(actor, "settings:edit")) return { ok: false, message: ADMIN_ONLY };
  const rows = await listServices(db);
  const i = rows.findIndex((r) => r.id === serviceId);
  const j = direction === "up" ? i - 1 : i + 1;
  const a = rows[i];
  const b = rows[j];
  if (i < 0 || !a || !b) return { ok: true };
  // Renumber everything so equal sort values from older data cannot get stuck.
  const order = rows.map((r) => r.id);
  order[i] = b.id;
  order[j] = a.id;
  for (const [idx, rid] of order.entries()) {
    await db.update(service).set({ sort: idx }).where(eq(service.id, rid));
  }
  return { ok: true };
}

/** Adds a ready-made list of services, skipping names the business already has. */
export async function addServiceTemplate(db: DB, actor: AppUser, key: string): Promise<Result<number>> {
  if (!can(actor, "settings:edit")) return { ok: false, message: ADMIN_ONLY };
  const template = SERVICE_TEMPLATES[key];
  if (!template) return { ok: false, message: "Choose a list from the options." };
  const existing = new Set((await listServices(db)).map((s) => s.name.toLowerCase()));
  let added = 0;
  for (const [name, price] of template.services) {
    if (existing.has(name.toLowerCase())) continue;
    const r = await addService(db, actor, { name, description: "", basePrice: price });
    if (r.ok) added += 1;
  }
  return { ok: true, value: added };
}
