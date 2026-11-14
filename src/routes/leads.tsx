import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import type { Lead } from "../db/schema";
import { can } from "../lib/can";
import { me, requirePermission } from "../lib/middleware";
import { centsToInput, formatMoney, lineCents, qtyToInput } from "../lib/money";
import { photoResponse, storePhoto, validatePhotos } from "../lib/photos";
import { ago, formatDay, formatLocal, formatWhen } from "../lib/time";
import {
  bookSchema,
  firstError,
  formFiles,
  formValues,
  id as idSchema,
  inboxQuerySchema,
  leadSchema,
  noteEventSchema,
  notesSchema,
  parseQuoteLines,
  quoteMetaSchema,
  statusSchema,
} from "../lib/validate";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LOST_REASONS,
  OPEN_STATUSES,
  URGENCIES,
  sourceLabel,
  statusHelp,
  statusLabel,
  urgencyLabel,
  type LeadStatus,
} from "../labels";
import {
  PAGE_SIZE,
  addNote,
  addEvent,
  book,
  createLead,
  deleteLead,
  getLead,
  listLeads,
  markQuoteSent,
  quoteExpired,
  quoteTotals,
  saveNotes,
  saveQuote,
  setStatus,
  statusCounts,
  todayBoard,
  type LeadDetail,
} from "../services/leads";
import { emailBooking, emailQuote, quoteUrl } from "../services/notify";
import { getService, listServices } from "../services/settings";
import { appOrigin } from "../auth/auth";
import {
  Alert,
  btn,
  Button,
  Card,
  Csrf,
  Empty,
  Facts,
  Field,
  H1,
  H2,
  Select,
  StatusBadge,
  TextArea,
  UrgencyBadge,
} from "../views/components";
import { formBody, render } from "./render";

export const leadRoutes = new Hono<AppEnv>();

const view = requirePermission("lead:view");
const work = requirePermission("lead:work");

const money = (c: Context<AppEnv>, cents: number) => formatMoney(cents, c.get("settings").currency);

// ---------- Shared bits ----------

const LeadRow = ({ c, l }: { c: Context<AppEnv>; l: Lead }) => (
  <li>
    <a href={`/leads/${l.id}`} class="block rounded-2xl border border-line bg-white p-4 shadow-sm hover:border-primary">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-semibold text-navy">{l.customerName}</span>
        <StatusBadge status={l.status} />
        <UrgencyBadge urgency={l.urgency} />
        <span class="ml-auto text-sm text-gray-700">#{l.number}</span>
      </div>
      <p class="mt-1 line-clamp-2 text-sm text-gray-800">
        {l.serviceName ? <span class="font-medium">{l.serviceName}. </span> : null}
        {l.description}
      </p>
      <p class="mt-1 text-xs text-gray-700">
        {ago(l.createdAt)}
        {l.totalCents > 0 ? ` · ${money(c, l.totalCents)}` : ""}
        {l.scheduledFor ? ` · Booked ${formatLocal(l.scheduledFor)}` : ""}
      </p>
    </a>
  </li>
);

// ---------- Today ----------

leadRoutes.get("/today", view, async (c) => {
  const board = await todayBoard(c.get("db"), c.get("timeZone"));
  const s = c.get("settings");
  const origin = appOrigin(c.env, c.get("origin"));
  const Section = ({ title, rows, empty, id }: { title: string; rows: Lead[]; empty: string; id: string }) => (
    <section aria-labelledby={id} class="mb-6">
      <h2 id={id} class="mb-2 flex items-center gap-2 text-lg font-bold text-navy">
        {title} <span class="rounded-full bg-white px-2 text-sm font-semibold text-gray-800">{rows.length}</span>
      </h2>
      {rows.length ? (
        <ul class="space-y-2">
          {rows.map((l) => (
            <LeadRow c={c} l={l} />
          ))}
        </ul>
      ) : (
        <p class="rounded-xl bg-white/70 px-4 py-3 text-sm text-gray-700">{empty}</p>
      )}
    </section>
  );
  return render(
    c,
    { title: "Today", active: "today" },
    <>
      <H1 sub="What needs doing now, most urgent first.">Today</H1>
      <Section id="h-reply" title="Needs a reply" rows={board.needsReply} empty="No new enquiries. Nice work." />
      <Section
        id="h-book"
        title="Accepted, ready to book"
        rows={board.toBook}
        empty="No accepted quotes waiting to book."
      />
      <Section id="h-wait" title="Quotes waiting on the customer" rows={board.awaiting} empty="No quotes waiting." />
      <Section id="h-up" title="Booked, coming up" rows={board.upcoming} empty="Nothing booked yet." />
      <Card class="mt-2">
        <H2>Your enquiry form</H2>
        <p class="mb-3 text-sm text-gray-800">
          Share this link on your website, social pages, email signature or a QR code. Enquiries land here.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <code class="min-w-0 flex-1 break-all rounded-lg bg-primary-50 px-3 py-2 text-sm">{`${origin}/enquire`}</code>
          <button type="button" class={btn("secondary")} data-copy={`${origin}/enquire`}>
            Copy link
          </button>
          <a class={btn("ghost")} href="/enquire" target="_blank" rel="noopener">
            Open form
          </a>
        </div>
        {s.businessName === "My Business" && can(c.get("user"), "settings:edit") ? (
          <p class="mt-3 text-sm">
            <a class="text-primary underline" href="/settings">
              Add your business name, prices and services
            </a>{" "}
            so the form and quotes look like yours.
          </p>
        ) : null}
      </Card>
    </>,
  );
});

// ---------- Inbox ----------

leadRoutes.get("/leads", view, async (c) => {
  const q = inboxQuerySchema.parse(c.req.query());
  const db = c.get("db");
  const [{ rows, total }, counts] = await Promise.all([listLeads(db, me(c), q), statusCounts(db)]);
  const openCount = OPEN_STATUSES.reduce((n, s) => n + counts[s], 0);
  const tabs: { key: LeadStatus | "open" | "all"; label: string; n: number }[] = [
    { key: "open", label: "Open", n: openCount },
    ...LEAD_STATUSES.map((s) => ({ key: s, label: statusLabel[s], n: counts[s] })),
    { key: "all", label: "All", n: Object.values(counts).reduce((a, b) => a + b, 0) },
  ];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams({ status: q.status, ...(q.q ? { q: q.q } : {}), ...over });
    return `/leads?${p.toString()}`;
  };
  return render(
    c,
    { title: "Leads", active: "leads" },
    <>
      <H1
        sub={q.status in statusHelp ? statusHelp[q.status as LeadStatus] : "Every enquiry, quote and job in one place."}
        action={
          <a class={btn("accent")} href="/leads/new">
            Add lead
          </a>
        }
      >
        Leads
      </H1>
      <nav aria-label="Filter by status" class="-mx-1 mb-3 overflow-x-auto pb-1">
        <ul class="flex gap-1 px-1">
          {tabs.map((t) => (
            <li>
              <a
                href={link({ status: t.key, page: "1" })}
                aria-current={q.status === t.key ? "page" : undefined}
                class={`flex min-h-11 items-center whitespace-nowrap rounded-full px-3 py-2 text-sm ${q.status === t.key ? "bg-primary font-semibold text-white" : "bg-white text-ink hover:bg-primary-50"}`}
              >
                {t.label} <span class="tabular-nums">{t.n}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <form method="get" action="/leads" role="search" class="mb-4 flex gap-2">
        <input type="hidden" name="status" value={q.status} />
        <label for="f-q" class="sr-only">
          Search leads
        </label>
        <input
          id="f-q"
          name="q"
          type="search"
          value={q.q ?? ""}
          maxlength={100}
          placeholder="Name, phone, email, address or number"
          class="min-w-0 flex-1 rounded-xl border border-field bg-white px-3 py-2.5"
        />
        <Button kind="secondary">Search</Button>
      </form>
      {rows.length ? (
        <ul class="space-y-2">
          {rows.map((l) => (
            <LeadRow c={c} l={l} />
          ))}
        </ul>
      ) : (
        <Empty>
          {q.q ? "No leads match that search." : "Nothing here yet."}{" "}
          <a class="text-primary underline" href="/leads/new">
            Add a lead
          </a>
        </Empty>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" class="mt-4 flex items-center justify-between">
          {q.page > 1 ? (
            <a class={btn("secondary")} href={link({ page: String(q.page - 1) })}>
              Previous
            </a>
          ) : (
            <span />
          )}
          <span class="text-sm">
            Page {q.page} of {pages}
          </span>
          {q.page < pages ? (
            <a class={btn("secondary")} href={link({ page: String(q.page + 1) })}>
              Next
            </a>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>,
  );
});

// ---------- New lead ----------

const NewLeadForm = async ({
  c,
  values = {},
  error,
}: {
  c: Context<AppEnv>;
  values?: Record<string, unknown>;
  error?: string;
}) => {
  const services = await listServices(c.get("db"), true);
  const v = (k: string) => (typeof values[k] === "string" ? values[k] : "");
  return (
    <>
      <H1 sub="For a phone call, email or walk-in. Website enquiries arrive here on their own.">Add a lead</H1>
      <Card>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <form method="post" action="/leads/new" enctype="multipart/form-data" data-enhance data-photos>
          <Csrf token={c.get("csrfToken")} />
          <Field label="Customer name" name="customerName" required maxlength={80} value={v("customerName")} />
          <div class="grid gap-x-4 sm:grid-cols-2">
            <Field label="Email" name="customerEmail" type="email" maxlength={254} value={v("customerEmail")} />
            <Field
              label="Phone"
              name="customerPhone"
              type="tel"
              inputmode="tel"
              maxlength={40}
              value={v("customerPhone")}
            />
          </div>
          <div class="grid gap-x-4 sm:grid-cols-2">
            <Select
              label="Came in by"
              name="source"
              required
              value={v("source") || "phone"}
              options={LEAD_SOURCES.map((s) => ({ value: s, label: sourceLabel[s] }))}
            />
            <Select
              label="Urgency"
              name="urgency"
              required
              value={v("urgency") || "flexible"}
              options={URGENCIES.map((u) => ({ value: u, label: urgencyLabel[u] }))}
            />
          </div>
          {services.length ? (
            <Select
              label="Service"
              name="serviceId"
              value={v("serviceId")}
              options={[{ value: "", label: "Not set" }, ...services.map((x) => ({ value: x.id, label: x.name }))]}
            />
          ) : null}
          <TextArea label="Job details" name="description" rows={4} maxlength={3000} value={v("description")} />
          <Field label="Address" name="address" maxlength={200} value={v("address")} />
          <Field label="Preferred time" name="preferredTime" maxlength={200} value={v("preferredTime")} />
          <div class="mb-4">
            <label for="f-photos" class="mb-1 block text-sm font-medium">
              Photos <span class="font-normal text-gray-600">(optional, up to 6)</span>
            </label>
            <input
              id="f-photos"
              name="photos"
              type="file"
              accept="image/*"
              multiple
              class="block w-full rounded-xl border border-field bg-white p-2.5"
            />
            <p data-photo-status class="mt-1 text-sm text-gray-700" aria-live="polite"></p>
          </div>
          <Button full>Save lead</Button>
        </form>
      </Card>
    </>
  );
};

leadRoutes.get("/leads/new", work, async (c) =>
  render(c, { title: "Add a lead", active: "new" }, await NewLeadForm({ c })),
);

leadRoutes.post("/leads/new", work, async (c) => {
  const body = await formBody(c);
  const values = formValues(body);
  const fail = async (error: string) =>
    render(c, { title: "Add a lead", active: "new", status: 400 }, await NewLeadForm({ c, values, error }));
  const parsed = leadSchema.safeParse(values);
  if (!parsed.success) return fail(firstError(parsed.error));
  const photos = validatePhotos(formFiles(body, "photos"));
  if (!photos.ok) return fail(photos.message);
  const svc = parsed.data.serviceId ? await getService(c.get("db"), parsed.data.serviceId) : undefined;
  const keys: string[] = [];
  for (const f of photos.files) keys.push(await storePhoto(c.env.PHOTOS, f));
  const row = await createLead(
    c.get("db"),
    c.env.DB,
    { ...parsed.data, serviceId: svc?.id ?? null, serviceName: svc?.name ?? "" },
    keys,
    me(c).name,
  );
  return c.redirect(`/leads/${row.id}?m=created`, 303);
});

// ---------- Lead detail ----------

const MESSAGES: Record<string, [tone: "success" | "info" | "warning", text: string]> = {
  created: ["success", "Lead saved."],
  saved: ["success", "Saved."],
  sent: ["success", "Quote sent. The customer has an email with their link."],
  sent_noemail: ["warning", "Quote marked as sent, but no email went out. Copy the link below and send it yourself."],
  booked: ["success", "Booking saved. The customer has an email confirming the time."],
  booked_noemail: ["success", "Booking saved."],
};

async function detailFor(c: Context<AppEnv>): Promise<LeadDetail | null> {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return null;
  return getLead(c.get("db"), parsed.data);
}

/** Blank rows shown under the quote lines, so a line can be added without any script. */
const BLANK_ROWS = 3;

const LeadPage = async ({
  c,
  detail,
  error,
}: {
  c: Context<AppEnv>;
  detail: LeadDetail;
  error?: string | undefined;
}) => {
  const s = c.get("settings");
  const tz = c.get("timeZone");
  const u = me(c);
  const { lead: l, items, photos, events } = detail;
  const t = quoteTotals(items, s);
  const origin = appOrigin(c.env, c.get("origin"));
  const link = quoteUrl(origin, l);
  const services = await listServices(c.get("db"), true);
  const msg = MESSAGES[c.req.query("m") ?? ""];
  const locked = Boolean(l.acceptedAt);
  const closed = l.status === "lost" || l.status === "done";
  const smsBody = `Hi ${l.customerName.split(" ")[0]}, here is your quote from ${s.businessName}: ${link}`;
  const tel = l.customerPhone.replace(/[^\d+]/g, "");
  const rows = [
    ...items.map((i) => ({
      desc: i.description,
      qty: qtyToInput(i.qtyHundredths),
      price: centsToInput(i.unitCents),
      amount: lineCents(i),
    })),
    ...Array.from({ length: locked ? 0 : BLANK_ROWS }, () => ({
      desc: "",
      qty: "1",
      price: "",
      amount: 0,
    })),
  ];
  return (
    <>
      <H1
        sub={`#${l.number} · ${sourceLabel[l.source]} · ${formatWhen(l.createdAt, tz)}`}
        action={
          <span class="flex flex-wrap items-center gap-2">
            <StatusBadge status={l.status} />
            <UrgencyBadge urgency={l.urgency} />
          </span>
        }
      >
        {l.customerName}
      </H1>
      {msg ? <Alert tone={msg[0]}>{msg[1]}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div class="grid gap-4">
        <Card label="Customer">
          <H2>Customer and job</H2>
          <Facts
            rows={[
              [
                "Phone",
                l.customerPhone ? (
                  <a class="text-primary underline" href={`tel:${tel}`}>
                    {l.customerPhone}
                  </a>
                ) : (
                  "Not given"
                ),
              ],
              [
                "Email",
                l.customerEmail ? (
                  <a class="text-primary underline" href={`mailto:${l.customerEmail}`}>
                    {l.customerEmail}
                  </a>
                ) : (
                  "Not given"
                ),
              ],
              ["Address", l.address || "Not given"],
              ["Service", l.serviceName || "Not set"],
              ["Came from", sourceLabel[l.source]],
              ["Urgency", urgencyLabel[l.urgency]],
              ["Preferred time", l.preferredTime || "Not given"],
            ]}
          />
          {l.description ? (
            <p class="mt-4 whitespace-pre-line rounded-xl bg-primary-50 p-3 text-gray-900">{l.description}</p>
          ) : null}
          {photos.length ? (
            <ul class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Photos">
              {photos.map((p, i) => (
                <li>
                  <a href={`/photos/lead/${p.id}`} target="_blank" rel="noopener">
                    <img
                      src={`/photos/lead/${p.id}`}
                      alt={`Photo ${i + 1} from ${l.customerName}`}
                      loading="lazy"
                      class="aspect-square w-full rounded-lg object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <div class="mt-4 flex flex-wrap gap-2">
            {l.customerPhone ? (
              <>
                <a class={btn("secondary")} href={`tel:${tel}`}>
                  Call
                </a>
                <a class={btn("secondary")} href={`sms:${tel}`}>
                  Text
                </a>
              </>
            ) : null}
            {l.customerEmail ? (
              <a
                class={btn("secondary")}
                href={`mailto:${l.customerEmail}?subject=${encodeURIComponent(`Your enquiry #${l.number}`)}`}
              >
                Email
              </a>
            ) : null}
          </div>
        </Card>

        <Card label="Quote" id="quote">
          <H2>Quote</H2>
          {locked ? (
            <Alert tone="success">
              Accepted by {l.acceptedName} on {formatWhen(l.acceptedAt, tz)} for {money(c, l.totalCents)}.
              {l.customerReply ? ` Message: "${l.customerReply}"` : ""}
            </Alert>
          ) : l.quoteSentAt ? (
            <p class="mb-3 text-sm text-gray-800">
              Sent {formatWhen(l.quoteSentAt, tz)}
              {l.quoteValidUntil
                ? `. ${quoteExpired(l, tz) ? "Expired" : "Valid until"} ${formatDay(l.quoteValidUntil)}.`
                : "."}
            </p>
          ) : null}
          <form method="post" action={`/leads/${l.id}/quote`} data-enhance data-quote-editor>
            <Csrf token={c.get("csrfToken")} />
            <TextArea
              label="Summary for the customer"
              name="quoteSummary"
              rows={3}
              maxlength={3000}
              value={l.quoteSummary}
              hint="What the job includes, in plain words."
            />
            <datalist id="saved-items">
              {services.map((x) => (
                <option value={x.name} data-price={x.basePriceCents > 0 ? centsToInput(x.basePriceCents) : ""} />
              ))}
            </datalist>
            <fieldset disabled={locked} class="mb-3">
              <legend class="mb-2 text-sm font-medium">Lines</legend>
              <div class="space-y-3">
                {rows.map((r, i) => (
                  <div class="rounded-xl border border-line p-3" data-line>
                    <label for={`d-${i}`} class="sr-only">
                      Line {i + 1} description
                    </label>
                    <input
                      id={`d-${i}`}
                      name="desc[]"
                      value={r.desc}
                      maxlength={300}
                      placeholder={i < items.length ? "" : "Add a line, or pick a saved item"}
                      list="saved-items"
                      class="mb-2 block min-h-11 w-full rounded-lg border border-field px-3 py-2"
                    />
                    <div class="flex flex-wrap items-center gap-2">
                      <label class="flex items-center gap-1 text-sm">
                        Qty
                        <input
                          name="qty[]"
                          value={r.qty}
                          inputmode="decimal"
                          maxlength={9}
                          class="min-h-11 w-16 rounded-lg border border-field px-2 py-2"
                        />
                      </label>
                      <label class="flex items-center gap-1 text-sm">
                        Price
                        <input
                          name="price[]"
                          value={r.price}
                          inputmode="decimal"
                          maxlength={13}
                          class="min-h-11 w-28 rounded-lg border border-field px-2 py-2"
                        />
                      </label>
                      {r.amount ? (
                        <span class="ml-auto text-sm font-semibold tabular-nums">{money(c, r.amount)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
            <dl class="mb-4 space-y-1 rounded-xl bg-primary-50 p-3 text-sm">
              {s.taxRateBp > 0 ? (
                <div class="flex justify-between">
                  <dt>
                    {s.taxLabel || "Tax"} ({s.taxRateBp / 100}%){s.pricesIncludeTax ? ", included" : ""}
                  </dt>
                  <dd class="tabular-nums">{money(c, t.taxCents)}</dd>
                </div>
              ) : null}
              <div class="flex justify-between font-bold">
                <dt>Total</dt>
                <dd class="tabular-nums">{money(c, t.totalCents)}</dd>
              </div>
            </dl>
            {!locked ? (
              <div class="flex flex-wrap gap-2">
                <Button kind="secondary">Save quote</Button>
                {!closed ? (
                  <Button
                    formaction={`/leads/${l.id}/send`}
                    confirm={
                      l.customerEmail
                        ? `Save and email this quote to ${l.customerEmail}?`
                        : "Save and mark this quote as sent? There is no email address, so send the link yourself."
                    }
                  >
                    {l.quoteSentAt ? "Save and send again" : "Save and send quote"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </form>
          {l.quoteSentAt ? (
            <div class="mt-4 border-t border-line pt-4">
              <p class="mb-2 text-sm font-medium">Customer's quote link</p>
              <div class="flex flex-wrap items-center gap-2">
                <code class="min-w-0 flex-1 break-all rounded-lg bg-primary-50 px-3 py-2 text-xs">{link}</code>
                <button type="button" class={btn("secondary")} data-copy={link}>
                  Copy link
                </button>
                <a class={btn("ghost")} href={link} target="_blank" rel="noopener">
                  View as customer
                </a>
                {l.customerPhone ? (
                  <a class={btn("ghost")} href={`sms:${tel}?&body=${encodeURIComponent(smsBody)}`}>
                    Text the link
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        <Card label="Booking and status">
          <H2>Booking and status</H2>
          {!closed ? (
            <form method="post" action={`/leads/${l.id}/book`} class="mb-4 flex flex-wrap items-end gap-2">
              <Csrf token={c.get("csrfToken")} />
              <div>
                <label for="f-when" class="mb-1 block text-sm font-medium">
                  Booked for
                </label>
                <input
                  id="f-when"
                  type="datetime-local"
                  name="scheduledFor"
                  value={l.scheduledFor ?? ""}
                  class="rounded-xl border border-field bg-white px-3 py-2.5"
                />
              </div>
              <Button kind="secondary">{l.scheduledFor ? "Change booking" : "Book it in"}</Button>
            </form>
          ) : null}
          <form method="post" action={`/leads/${l.id}/status`} class="mb-4">
            <Csrf token={c.get("csrfToken")} />
            <div class="flex flex-wrap items-end gap-2">
              <Select
                label="Status"
                name="status"
                required
                value={l.status}
                class="!mb-0"
                options={LEAD_STATUSES.map((s2) => ({ value: s2, label: statusLabel[s2] }))}
              />
              <div class="min-w-48 flex-1">
                <label for="f-lostReason" class="mb-1 block text-sm font-medium">
                  Reason if lost <span class="font-normal text-gray-600">(optional)</span>
                </label>
                <input
                  id="f-lostReason"
                  name="lostReason"
                  list="lost-reasons"
                  maxlength={200}
                  value={l.lostReason}
                  class="block w-full rounded-xl border border-field bg-white px-3 py-2.5"
                />
                <datalist id="lost-reasons">
                  {LOST_REASONS.map((r) => (
                    <option value={r} />
                  ))}
                </datalist>
              </div>
              <Button kind="secondary">Update status</Button>
            </div>
          </form>
        </Card>

        <Card label="Notes and history">
          <H2>Notes and history</H2>
          <form method="post" action={`/leads/${l.id}/notes`} data-enhance>
            <Csrf token={c.get("csrfToken")} />
            <TextArea
              label="Private notes (the customer never sees these)"
              name="internalNotes"
              rows={3}
              maxlength={4000}
              value={l.internalNotes}
            />
            <Button kind="secondary">Save notes</Button>
          </form>
          <form method="post" action={`/leads/${l.id}/event`} class="mt-4 flex flex-wrap items-end gap-2">
            <Csrf token={c.get("csrfToken")} />
            <div class="min-w-48 flex-1">
              <label for="f-text" class="mb-1 block text-sm font-medium">
                Add to the timeline
              </label>
              <input
                id="f-text"
                name="text"
                required
                maxlength={1000}
                placeholder="For example: Called, left a voicemail"
                class="block w-full rounded-xl border border-field bg-white px-3 py-2.5"
              />
            </div>
            <Button kind="secondary">Add</Button>
          </form>
          <ol class="mt-4 space-y-3 border-l-2 border-line pl-4">
            {events.map((e) => (
              <li>
                <p class="text-sm text-gray-900">{e.text}</p>
                <p class="text-xs text-gray-700">
                  {formatWhen(e.createdAt, tz)}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </Card>

        {can(u, "lead:delete") ? (
          <form method="post" action={`/leads/${l.id}/delete`}>
            <Csrf token={c.get("csrfToken")} />
            <Button kind="danger" confirm="Delete this lead, its quote and photos for good? This cannot be undone.">
              Delete lead
            </Button>
          </form>
        ) : null}
      </div>
    </>
  );
};

leadRoutes.get("/leads/:id", view, async (c) => {
  const detail = await detailFor(c);
  if (!detail) return c.notFound();
  return render(c, { title: detail.lead.customerName, active: "leads" }, await LeadPage({ c, detail }));
});

/** Re-renders the lead page with an error, or redirects back with a message. */
async function back(c: Context<AppEnv>, leadId: string, r: { ok: true } | { ok: false; message: string }, m = "saved") {
  if (r.ok) return c.redirect(`/leads/${leadId}?m=${m}`, 303);
  const detail = await getLead(c.get("db"), leadId);
  if (!detail) return c.notFound();
  return render(
    c,
    { title: detail.lead.customerName, active: "leads", status: 400 },
    await LeadPage({ c, detail, error: r.message }),
  );
}

const withLead =
  (handler: (c: Context<AppEnv>, detail: LeadDetail, values: Record<string, unknown>) => Promise<Response>) =>
  async (c: Context<AppEnv>) => {
    const detail = await detailFor(c);
    if (!detail) return c.notFound();
    return handler(c, detail, formValues(await formBody(c)));
  };

async function saveQuoteFrom(c: Context<AppEnv>, detail: LeadDetail, values: Record<string, unknown>) {
  const meta = quoteMetaSchema.safeParse(values);
  if (!meta.success) return { ok: false as const, message: firstError(meta.error) };
  const lines = parseQuoteLines(values);
  if (!lines.ok) return lines;
  return saveQuote(c.get("db"), me(c), detail.lead.id, meta.data.quoteSummary, lines.lines);
}

leadRoutes.post(
  "/leads/:id/quote",
  work,
  withLead(async (c, detail, values) => back(c, detail.lead.id, await saveQuoteFrom(c, detail, values))),
);

leadRoutes.post(
  "/leads/:id/send",
  work,
  withLead(async (c, detail, values) => {
    const saved = await saveQuoteFrom(c, detail, values);
    if (!saved.ok) return back(c, detail.lead.id, saved);
    const s = c.get("settings");
    const r = await markQuoteSent(c.get("db"), me(c), detail.lead.id, s, c.get("timeZone"));
    if (!r.ok || !r.value) return back(c, detail.lead.id, r.ok ? { ok: false, message: "Could not send." } : r);
    const origin = appOrigin(c.env, c.get("origin"));
    const sent = await emailQuote(c.env, s, r.value.lead, origin);
    if (!sent)
      await addEvent(c.get("db"), detail.lead.id, "quote_sent", "No email sent. Share the link yourself.", me(c).name);
    return c.redirect(`/leads/${detail.lead.id}?m=${sent ? "sent" : "sent_noemail"}#quote`, 303);
  }),
);

leadRoutes.post(
  "/leads/:id/status",
  work,
  withLead(async (c, detail, values) => {
    const parsed = statusSchema.safeParse(values);
    if (!parsed.success) return back(c, detail.lead.id, { ok: false, message: firstError(parsed.error) });
    return back(
      c,
      detail.lead.id,
      await setStatus(c.get("db"), me(c), detail.lead.id, parsed.data.status, parsed.data.lostReason),
    );
  }),
);

leadRoutes.post(
  "/leads/:id/book",
  work,
  withLead(async (c, detail, values) => {
    const parsed = bookSchema.safeParse(values);
    if (!parsed.success) return back(c, detail.lead.id, { ok: false, message: firstError(parsed.error) });
    const r = await book(c.get("db"), me(c), detail.lead.id, parsed.data.scheduledFor);
    if (!r.ok) return back(c, detail.lead.id, r);
    let emailed = false;
    if (parsed.data.scheduledFor) {
      const fresh = await getLead(c.get("db"), detail.lead.id);
      if (fresh) {
        const s = c.get("settings");
        const origin = appOrigin(c.env, c.get("origin"));
        emailed = await emailBooking(c.env, s, fresh.lead, origin);
      }
    }
    return c.redirect(`/leads/${detail.lead.id}?m=${emailed ? "booked" : "booked_noemail"}`, 303);
  }),
);

leadRoutes.post(
  "/leads/:id/notes",
  work,
  withLead(async (c, detail, values) => {
    const parsed = notesSchema.safeParse(values);
    if (!parsed.success) return back(c, detail.lead.id, { ok: false, message: firstError(parsed.error) });
    return back(c, detail.lead.id, await saveNotes(c.get("db"), me(c), detail.lead.id, parsed.data.internalNotes));
  }),
);

leadRoutes.post(
  "/leads/:id/event",
  work,
  withLead(async (c, detail, values) => {
    const parsed = noteEventSchema.safeParse(values);
    if (!parsed.success) return back(c, detail.lead.id, { ok: false, message: firstError(parsed.error) });
    return back(c, detail.lead.id, await addNote(c.get("db"), me(c), detail.lead.id, parsed.data.text));
  }),
);

leadRoutes.post(
  "/leads/:id/delete",
  requirePermission("lead:delete"),
  withLead(async (c, detail) => {
    const r = await deleteLead(c.get("db"), me(c), detail.lead.id);
    if (!r.ok) return back(c, detail.lead.id, r);
    if (r.value?.length) await c.env.PHOTOS.delete(r.value);
    return c.redirect("/leads", 303);
  }),
);

// ---------- Photos ----------
// Looked up by photo id through its lead, never by storage key, and only for signed-in staff.

leadRoutes.get("/photos/lead/:id", view, async (c) => {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return c.notFound();
  const row = await c.env.DB.prepare("SELECT key FROM lead_photo WHERE id = ?")
    .bind(parsed.data)
    .first<{ key: string }>();
  if (!row) return c.notFound();
  return (await photoResponse(c.env.PHOTOS, row.key)) ?? c.notFound();
});
