import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { user, type AppSettings, type Lead } from "../db/schema";
import type { Bindings } from "../env";
import { emailButton, emailDelivers, sendEmail } from "../lib/email";
import { formatMoney } from "../lib/money";
import { escapeHtml } from "../lib/text";
import { formatDay, formatLocal } from "../lib/time";
import { urgencyLabel } from "../labels";

/**
 * Every email CatchDesk sends. Customer emails reply to the business's support email, so answers reach a person.
 * Sending never blocks the action that triggered it: a failed email is logged, and the lead is still saved.
 */

export const quoteUrl = (origin: string, row: Pick<Lead, "publicToken">) => `${origin}/q/${row.publicToken}`;
export const leadUrl = (origin: string, row: Pick<Lead, "id">) => `${origin}/leads/${row.id}`;

async function teamEmails(db: DB): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(sql`${user.role} IS NOT NULL AND ${user.isDemo} = 0`)
    .all();
  return rows.map((r) => r.email);
}

async function safely(task: () => Promise<void>, event: string): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (err) {
    console.error(JSON.stringify({ event, error: String(err) }));
    return false;
  }
}

const replyTo = (s: AppSettings) => (s.supportEmail ? { replyTo: s.supportEmail } : {});

/** Tells the team about a new enquiry. Staff addresses go in BCC so they are not shared with each other. */
export async function alertNewLead(env: Bindings, db: DB, s: AppSettings, row: Lead, origin: string): Promise<void> {
  if (!s.notifyNewLead) return;
  const to = await teamEmails(db);
  if (to.length === 0) return;
  const url = leadUrl(origin, row);
  const what = row.serviceName || "an enquiry";
  await safely(
    () =>
      sendEmail(env, {
        to: to[0] ?? "",
        bcc: to.slice(1),
        subject: `${row.urgency === "urgent" ? "Urgent: " : ""}New enquiry from ${row.customerName} (#${row.number})`,
        text: `${row.customerName} sent ${what}.\n\nUrgency: ${urgencyLabel[row.urgency]}\n${row.description}\n\nOpen it: ${url}`,
        html: `<p><strong>${escapeHtml(row.customerName)}</strong> sent ${escapeHtml(what)}.</p><p>Urgency: ${escapeHtml(urgencyLabel[row.urgency])}</p><p style="white-space:pre-wrap">${escapeHtml(row.description)}</p>${emailButton(url, "Open the enquiry")}`,
      }),
    "alert_new_lead_failed",
  );
}

/** Thanks the customer for their enquiry, so they know it arrived. */
export async function confirmEnquiry(env: Bindings, s: AppSettings, row: Lead): Promise<void> {
  if (!row.customerEmail) return;
  const name = s.businessName;
  await safely(
    () =>
      sendEmail(env, {
        to: row.customerEmail,
        ...replyTo(s),
        subject: `We got your enquiry (#${row.number})`,
        text: `Hi ${row.customerName},\n\nThanks for getting in touch with ${name}. We have your enquiry and will reply soon.${s.phone ? `\n\nIf it is urgent, call us on ${s.phone}.` : ""}\n\nYour reference is #${row.number}.`,
        html: `<p>Hi ${escapeHtml(row.customerName)},</p><p>Thanks for getting in touch with ${escapeHtml(name)}. We have your enquiry and will reply soon.</p>${s.phone ? `<p>If it is urgent, call us on ${escapeHtml(s.phone)}.</p>` : ""}<p>Your reference is #${row.number}.</p>`,
      }),
    "confirm_enquiry_failed",
  );
}

/** Sends the quote link to the customer. Returns false when the email could not be sent. */
export async function emailQuote(env: Bindings, s: AppSettings, row: Lead, origin: string): Promise<boolean> {
  if (!row.customerEmail || !emailDelivers(env)) return false;
  const url = quoteUrl(origin, row);
  const total = formatMoney(row.totalCents, s.currency);
  return safely(
    () =>
      sendEmail(env, {
        to: row.customerEmail,
        ...replyTo(s),
        subject: `Your quote from ${s.businessName} (#${row.number})`,
        text: `Hi ${row.customerName},\n\nYour quote is ready: ${total}.${row.quoteValidUntil ? ` It is valid until ${formatDay(row.quoteValidUntil)}.` : ""}\n\nView and accept it here: ${url}\n\nAny questions, just reply to this email.`,
        html: `<p>Hi ${escapeHtml(row.customerName)},</p><p>Your quote is ready: <strong>${escapeHtml(total)}</strong>.${row.quoteValidUntil ? ` It is valid until ${escapeHtml(formatDay(row.quoteValidUntil))}.` : ""}</p>${emailButton(url, "View and accept your quote")}<p>Any questions, just reply to this email.</p>`,
      }),
    "email_quote_failed",
  );
}

/** Tells the team a quote was accepted, and thanks the customer with what happens next. */
export async function alertAccepted(env: Bindings, db: DB, s: AppSettings, row: Lead, origin: string): Promise<void> {
  const to = await teamEmails(db);
  const total = formatMoney(row.totalCents, s.currency);
  if (to.length > 0) {
    await safely(
      () =>
        sendEmail(env, {
          to: to[0] ?? "",
          bcc: to.slice(1),
          subject: `Quote accepted: ${row.customerName} (#${row.number}), ${total}`,
          text: `${row.customerName} accepted the quote for ${total}.${row.customerReply ? `\n\nTheir message: ${row.customerReply}` : ""}\n\nBook it in: ${leadUrl(origin, row)}`,
          html: `<p><strong>${escapeHtml(row.customerName)}</strong> accepted the quote for <strong>${escapeHtml(total)}</strong>.</p>${row.customerReply ? `<p>Their message: ${escapeHtml(row.customerReply)}</p>` : ""}${emailButton(leadUrl(origin, row), "Book it in")}`,
        }),
      "alert_accepted_failed",
    );
  }
  if (row.customerEmail) {
    await safely(
      () =>
        sendEmail(env, {
          to: row.customerEmail,
          ...replyTo(s),
          subject: `Thanks, your quote is accepted (#${row.number})`,
          text: `Hi ${row.customerName},\n\nThanks for accepting our quote for ${total}. We will be in touch to book a time.\n\nYour quote: ${quoteUrl(origin, row)}`,
          html: `<p>Hi ${escapeHtml(row.customerName)},</p><p>Thanks for accepting our quote for <strong>${escapeHtml(total)}</strong>. We will be in touch to book a time.</p>${emailButton(quoteUrl(origin, row), "View your quote")}`,
        }),
      "confirm_accepted_failed",
    );
  }
}

/** Confirms a booked visit to the customer. */
export async function emailBooking(env: Bindings, s: AppSettings, row: Lead, origin: string): Promise<boolean> {
  if (!row.customerEmail || !row.scheduledFor || !emailDelivers(env)) return false;
  const when = formatLocal(row.scheduledFor);
  return safely(
    () =>
      sendEmail(env, {
        to: row.customerEmail,
        ...replyTo(s),
        subject: `Booked: ${when} (#${row.number})`,
        text: `Hi ${row.customerName},\n\nYou are booked in with ${s.businessName} for ${when}.${row.address ? `\nAddress: ${row.address}` : ""}\n\nIf that time no longer suits, reply to this email.\n\nYour quote: ${quoteUrl(origin, row)}`,
        html: `<p>Hi ${escapeHtml(row.customerName)},</p><p>You are booked in with ${escapeHtml(s.businessName)} for <strong>${escapeHtml(when)}</strong>.</p>${row.address ? `<p>Address: ${escapeHtml(row.address)}</p>` : ""}<p>If that time no longer suits, reply to this email.</p>${emailButton(quoteUrl(origin, row), "View your quote")}`,
      }),
    "email_booking_failed",
  );
}

/** Tells the team a customer declined, with their reason. */
export async function alertDeclined(env: Bindings, db: DB, row: Lead, origin: string): Promise<void> {
  const to = await teamEmails(db);
  if (to.length === 0) return;
  await safely(
    () =>
      sendEmail(env, {
        to: to[0] ?? "",
        bcc: to.slice(1),
        subject: `Quote declined: ${row.customerName} (#${row.number})`,
        text: `${row.customerName} declined the quote.${row.customerReply ? `\n\nTheir message: ${row.customerReply}` : ""}\n\n${leadUrl(origin, row)}`,
        html: `<p><strong>${escapeHtml(row.customerName)}</strong> declined the quote.</p>${row.customerReply ? `<p>Their message: ${escapeHtml(row.customerReply)}</p>` : ""}${emailButton(leadUrl(origin, row), "Open the lead")}`,
      }),
    "alert_declined_failed",
  );
}
