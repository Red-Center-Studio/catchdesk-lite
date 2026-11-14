import { sql } from "drizzle-orm";
import { check as checkConstraint, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Database schema. One deploy serves one business, so there is no organisation table.
 * Ids are text UUIDs. App dates are ISO timestamps in UTC stored as text.
 * Better Auth's own tables (user, session, account, verification) use the column types it expects.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const timestamps = {
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
};

// ---------- Better Auth tables ----------

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    // Better Auth calls this field "name". It is the person's full name.
    name: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    // null while the account waits for an admin to give it a role.
    role: text("role", { enum: ["admin", "staff"] }),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [checkConstraint("user_role_check", sql`${t.role} IS NULL OR ${t.role} IN ('admin', 'staff')`)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------- App tables ----------
// Money is stored as whole cents (integers) so totals never pick up rounding errors.

export const appSettings = sqliteTable(
  "app_settings",
  {
    // Always 1: there is exactly one settings row, created by a migration.
    id: integer("id").primaryKey(),
    businessName: text("business_name").notNull().default("My Business"),
    supportEmail: text("support_email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    setupHelpUrl: text("setup_help_url").notNull().default("https://redcenterstudio.com/products/catchdesk/"),
    showSetupOffer: integer("show_setup_offer", { mode: "boolean" }).notNull().default(true),
    // IANA time zone such as America/Chicago. Empty means the TIME_ZONE value in wrangler.jsonc.
    timeZone: text("time_zone").notNull().default(""),
    // ISO 4217 code used to show prices.
    currency: text("currency").notNull().default("USD"),
    // Tax shown on quotes. A rate of 0 hides the tax line. Basis points: 1000 = 10%.
    taxLabel: text("tax_label").notNull().default("Tax"),
    taxRateBp: integer("tax_rate_bp").notNull().default(0),
    pricesIncludeTax: integer("prices_include_tax", { mode: "boolean" }).notNull().default(false),
    quoteValidDays: integer("quote_valid_days").notNull().default(30),
    // Shown at the top of the public enquiry form.
    enquiryIntro: text("enquiry_intro")
      .notNull()
      .default("Tell us what you need. Add a few photos if you can, and we will reply with a quote."),
    // Email the team when a new enquiry arrives.
    notifyNewLead: integer("notify_new_lead", { mode: "boolean" }).notNull().default(true),
    // Last lead number handed out, so references read 1001, 1002 and so on.
    lastLeadNumber: integer("last_lead_number").notNull().default(1000),
    ...timestamps,
  },
  (t) => [checkConstraint("app_settings_single_row", sql`${t.id} = 1`)],
);

/** The services a business offers. Customers pick one on the enquiry form, and its price is a quick pick in the quote builder. */
export const service = sqliteTable("service", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // Usual price, offered as a quick pick in the quote builder. 0 means "price on inspection".
  basePriceCents: integer("base_price_cents").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
});

export const lead = sqliteTable(
  "lead",
  {
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    // Secret part of the customer's quote link. Long and random, so it cannot be guessed.
    publicToken: text("public_token").notNull(),
    status: text("status", {
      enum: ["new", "needs_info", "quoted", "accepted", "booked", "done", "lost"],
    })
      .notNull()
      .default("new"),
    source: text("source", { enum: ["form", "phone", "email", "walk_in", "other"] })
      .notNull()
      .default("form"),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull().default(""),
    customerPhone: text("customer_phone").notNull().default(""),
    address: text("address").notNull().default(""),
    serviceId: text("service_id"),
    serviceName: text("service_name").notNull().default(""),
    description: text("description").notNull().default(""),
    urgency: text("urgency", { enum: ["flexible", "soon", "urgent"] })
      .notNull()
      .default("flexible"),
    preferredTime: text("preferred_time").notNull().default(""),
    internalNotes: text("internal_notes").notNull().default(""),
    // Booked visit, as a local date and time "YYYY-MM-DDTHH:MM" in the business time zone.
    scheduledFor: text("scheduled_for"),
    lostReason: text("lost_reason").notNull().default(""),
    // Quote. Line items live in quote_item; these are the parts shown around them.
    quoteSummary: text("quote_summary").notNull().default(""),
    quoteValidUntil: text("quote_valid_until"),
    quoteSentAt: text("quote_sent_at"),
    acceptedAt: text("accepted_at"),
    acceptedName: text("accepted_name").notNull().default(""),
    // What the customer wrote when accepting or declining, such as times that suit them.
    customerReply: text("customer_reply").notNull().default(""),
    // Total at the moment the quote was sent or accepted, in cents.
    totalCents: integer("total_cents").notNull().default(0),
    doneAt: text("done_at"),
    ...timestamps,
  },
  (t) => [
    checkConstraint(
      "lead_status_check",
      sql`${t.status} IN ('new', 'needs_info', 'quoted', 'accepted', 'booked', 'done', 'lost')`,
    ),
    uniqueIndex("lead_token_idx").on(t.publicToken),
    uniqueIndex("lead_number_idx").on(t.number),
    index("lead_status_created_idx").on(t.status, t.createdAt),
  ],
);

export const quoteItem = sqliteTable(
  "quote_item",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    // Quantity in hundredths (150 = 1.5), so hours and part quantities both work.
    qtyHundredths: integer("qty_hundredths").notNull().default(100),
    unitCents: integer("unit_cents").notNull().default(0),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("quote_item_lead_idx").on(t.leadId)],
);

export const leadPhoto = sqliteTable(
  "lead_photo",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    ...timestamps,
  },
  (t) => [index("lead_photo_lead_idx").on(t.leadId)],
);

/** The timeline on each lead: who did what, and when. */
export const leadEvent = sqliteTable(
  "lead_event",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    text: text("text").notNull().default(""),
    actorName: text("actor_name").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("lead_event_lead_idx").on(t.leadId, t.createdAt)],
);

export const schema = {
  user,
  session,
  account,
  verification,
  appSettings,
  service,
  lead,
  quoteItem,
  leadPhoto,
  leadEvent,
};

export type User = typeof user.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type Service = typeof service.$inferSelect;
export type Lead = typeof lead.$inferSelect;
export type QuoteItem = typeof quoteItem.$inferSelect;
export type LeadPhoto = typeof leadPhoto.$inferSelect;
export type LeadEvent = typeof leadEvent.$inferSelect;
