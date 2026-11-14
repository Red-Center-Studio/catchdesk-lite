import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "../auth/auth";
import { CURRENCIES, LEAD_SOURCES, LEAD_STATUSES, ROLES, URGENCIES } from "../labels";
import { parseMoney, parseQty } from "./money";
import { isValidTimeZone } from "./time";

/**
 * Server-side validation for every form and query. Nothing sent by the browser is trusted: ids, roles, money
 * and statuses are all checked here before any database work.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long (${max} characters at most).`);
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (${max} characters at most).`)
    .optional()
    .transform((v) => v ?? "");
const email = z.string().trim().toLowerCase().max(254, "Email is too long.").pipe(z.email("Enter a valid email."));
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long.")
  .optional()
  .transform((v) => v ?? "")
  .refine((v) => v === "" || z.email().safeParse(v).success, { message: "Enter a valid email." });
const phone = z
  .string()
  .trim()
  .max(40, "Phone number is too long.")
  .optional()
  .transform((v) => v ?? "")
  .refine((v) => v === "" || /^[+()\d\s.-]{6,40}$/.test(v), { message: "Enter a valid phone number." });
const password = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`);
export const id = z.uuid("Something went wrong with that link. Go back and try again.");
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.uuid().safeParse(v).success, { message: "Choose an option from the list." });
const checkbox = z
  .union([z.literal("1"), z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "1" || v === "on" || v === "true");
const money = (label: string) =>
  z
    .string()
    .max(20)
    .optional()
    .transform((v, ctx) => {
      const cents = parseMoney(v ?? "");
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: `${label} must be an amount such as 120 or 120.50.` });
        return z.NEVER;
      }
      return cents;
    });
const wholeIn = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, `${label} must be a whole number.`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, { message: `${label} must be between ${min} and ${max}.` });
const localDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), {
    message: "Choose a date and time.",
  });

// ---------- Accounts ----------

export const signUpSchema = z.object({ fullName: required(80, "Full name"), email, password });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX),
  next: z.string().max(200).optional(),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ token: z.string().min(1).max(256), password, confirm: z.string().max(PASSWORD_MAX) })
  .refine((v) => v.password === v.confirm, { message: "The two passwords do not match.", path: ["confirm"] });

export const accountNameSchema = z.object({ fullName: required(80, "Full name") });
export const accountEmailSchema = z.object({ email });
export const accountPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX),
    newPassword: password,
    confirm: z.string().max(PASSWORD_MAX),
  })
  .refine((v) => v.newPassword === v.confirm, { message: "The two new passwords do not match.", path: ["confirm"] });

export const roleSchema = z.object({ role: z.enum(ROLES) });

// ---------- Enquiries and leads ----------

/** The public enquiry form. `website` is a hidden trap field: people never fill it in, bots usually do. */
export const enquirySchema = z
  .object({
    customerName: required(80, "Your name"),
    customerEmail: optionalEmail,
    customerPhone: phone,
    serviceId: optionalId,
    description: required(3000, "What you need"),
    address: optionalText(200, "Address or suburb"),
    urgency: z.enum(URGENCIES).catch("flexible"),
    preferredTime: optionalText(200, "Times that suit you"),
    website: z.string().max(200).optional(),
    consent: checkbox,
  })
  .refine((v) => v.customerEmail !== "" || v.customerPhone !== "", {
    message: "Add an email or a phone number so we can reply.",
    path: ["customerEmail"],
  })
  .refine((v) => v.consent, {
    message: "Tick the box to agree to be contacted about this enquiry.",
    path: ["consent"],
  });

/** A lead typed in by staff, for example from a phone call. */
export const leadSchema = z
  .object({
    customerName: required(80, "Customer name"),
    customerEmail: optionalEmail,
    customerPhone: phone,
    serviceId: optionalId,
    description: optionalText(3000, "Job details"),
    address: optionalText(200, "Address"),
    urgency: z.enum(URGENCIES).catch("flexible"),
    preferredTime: optionalText(200, "Preferred time"),
    source: z.enum(LEAD_SOURCES).catch("phone"),
  })
  .refine((v) => v.customerEmail !== "" || v.customerPhone !== "", {
    message: "Add an email or a phone number for the customer.",
    path: ["customerEmail"],
  });

export const statusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  lostReason: optionalText(200, "Reason"),
});
export const notesSchema = z.object({ internalNotes: optionalText(4000, "Notes") });
export const bookSchema = z.object({ scheduledFor: localDateTime });
export const noteEventSchema = z.object({ text: required(1000, "Note") });

export interface QuoteLineInput {
  description: string;
  qtyHundredths: number;
  unitCents: number;
}

/**
 * The quote editor sends parallel arrays (desc[], qty[], price[]). Rows with no description are skipped, so blank
 * rows at the end of the form are fine.
 */
export function parseQuoteLines(
  values: Record<string, unknown>,
): { ok: true; lines: QuoteLineInput[] } | { ok: false; message: string } {
  const arr = (k: string): string[] => {
    const v = values[k];
    return Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
  };
  const desc = arr("desc");
  const qty = arr("qty");
  const price = arr("price");
  if (desc.length > 40) return { ok: false, message: "A quote can have 40 lines at most." };
  const lines: QuoteLineInput[] = [];
  for (let i = 0; i < desc.length; i++) {
    const d = (desc[i] ?? "").trim();
    if (!d) continue;
    if (d.length > 300) return { ok: false, message: `Line ${i + 1} is too long (300 characters at most).` };
    const q = parseQty(qty[i] ?? "");
    if (q === null) return { ok: false, message: `Line ${i + 1}: quantity must be a number such as 1 or 2.5.` };
    const p = parseMoney(price[i] ?? "");
    if (p === null) return { ok: false, message: `Line ${i + 1}: price must be an amount such as 120 or 120.50.` };
    lines.push({ description: d, qtyHundredths: q, unitCents: p });
  }
  return { ok: true, lines };
}

export const quoteMetaSchema = z.object({
  quoteSummary: optionalText(3000, "Summary"),
});

/** The customer's answer on their quote page. */
export const acceptSchema = z.object({
  acceptedName: required(80, "Your name"),
  customerReply: optionalText(1000, "Message"),
  agree: checkbox.refine((v) => v, { message: "Tick the box to accept the quote." }),
});

export const declineSchema = z.object({ customerReply: optionalText(1000, "Message") });

export const inboxQuerySchema = z.object({
  status: z.enum([...LEAD_STATUSES, "open", "all"]).catch("open"),
  q: trimmed(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

// ---------- Settings ----------

export const businessSchema = z.object({
  businessName: required(80, "Business name"),
  supportEmail: optionalEmail,
  phone,
  timeZone: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => v === "" || isValidTimeZone(v), { message: "Choose a time zone from the list." }),
  showSetupOffer: checkbox,
});

export const pricingSchema = z.object({
  currency: z.enum(CURRENCIES),
  taxLabel: optionalText(20, "Tax name"),
  taxRate: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$|^$/, "Tax rate must be a percentage such as 10 or 8.25.")
    .transform((v) => Math.round(Number(v || "0") * 100)),
  pricesIncludeTax: checkbox,
  quoteValidDays: wholeIn("Quote valid for", 1, 365),
});

export const enquiryFormSchema = z.object({
  enquiryIntro: optionalText(600, "Intro text"),
  notifyNewLead: checkbox,
});

export const serviceSchema = z.object({
  name: required(100, "Service name"),
  description: optionalText(300, "Description"),
  basePrice: money("Usual price"),
});

export const templateSchema = z.object({ template: z.string().max(40) });
export const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

/** Turns a parsed form body into plain values. Keys ending in [] become arrays; files are dropped. */
export function formValues(body: Record<string, string | File | (string | File)[]>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const strings = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string");
    if (key.endsWith("[]")) out[key.slice(0, -2)] = strings;
    else if (strings.length > 0) out[key] = strings[strings.length - 1];
  }
  return out;
}

/** Every file sent under a field name (photos[] or photos). */
export function formFiles(body: Record<string, string | File | (string | File)[]>, key: string): unknown[] {
  const v = body[`${key}[]`] ?? body[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** The first validation message, written for people. */
export const firstError = (error: z.ZodError): string => error.issues[0]?.message ?? "Please check the form.";

export { trimmed };
