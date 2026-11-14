import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import type { AppSettings, Service } from "../db/schema";
import { formatMoney, lineCents } from "../lib/money";
import { photoResponse, storePhoto, validatePhotos } from "../lib/photos";
import { formatDay, formatLocal } from "../lib/time";
import {
  acceptSchema,
  declineSchema,
  enquirySchema,
  firstError,
  formFiles,
  formValues,
  id as idSchema,
} from "../lib/validate";
import { URGENCIES, urgencyQuestion } from "../labels";
import {
  acceptQuote,
  createLead,
  declineQuote,
  getLeadByToken,
  quoteExpired,
  quoteTotals,
  type LeadDetail,
} from "../services/leads";
import { alertAccepted, alertDeclined, alertNewLead, confirmEnquiry } from "../services/notify";
import { listServices } from "../services/settings";
import { appOrigin } from "../auth/auth";
import { Alert, btn, Button, Card, Checkbox, Csrf, Field, H2, Select, TextArea } from "../views/components";
import { formBody, rateLimited, render } from "./render";

export const publicRoutes = new Hono<AppEnv>();

const TOO_MANY = "Too many sends from your connection. Wait a minute, then try again.";

// ---------- Enquiry form ----------

interface EnquiryValues {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceId?: string;
  description?: string;
  address?: string;
  urgency?: string;
  preferredTime?: string;
}

const EnquiryForm = ({
  c,
  s,
  services,
  values = {},
  error,
}: {
  c: Context<AppEnv>;
  s: AppSettings;
  services: Service[];
  values?: EnquiryValues;
  error?: string | undefined;
}) => {
  return (
    <>
      <div class="mb-5 rounded-2xl bg-navy-800 px-5 py-5 text-white shadow-md">
        <h1 class="text-2xl font-bold tracking-tight">Get a quote</h1>
        {s.enquiryIntro ? <p class="mt-2 text-navy-200">{s.enquiryIntro}</p> : null}
      </div>
      <Card>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <form method="post" action="/enquire" enctype="multipart/form-data" data-enhance data-photos>
          <Csrf token={c.get("csrfToken")} />
          {/* Trap field for bots. Hidden from people and from screen readers. */}
          <div class="hidden" aria-hidden="true">
            <label for="f-website">Leave this empty</label>
            <input id="f-website" name="website" type="text" tabindex={-1} autocomplete="off" />
          </div>
          <Field
            label="Your name"
            name="customerName"
            required
            autocomplete="name"
            maxlength={80}
            value={values.customerName}
          />
          <div class="grid gap-x-4 sm:grid-cols-2">
            <Field
              label="Email"
              name="customerEmail"
              type="email"
              autocomplete="email"
              maxlength={254}
              value={values.customerEmail}
            />
            <Field
              label="Phone"
              name="customerPhone"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              maxlength={40}
              value={values.customerPhone}
            />
          </div>
          <p class="-mt-2 mb-4 text-sm text-gray-700">Add an email, a phone number or both, so we can reply.</p>
          {services.length > 0 ? (
            <Select
              label="What do you need?"
              name="serviceId"
              value={values.serviceId}
              options={[
                { value: "", label: "Not sure, or something else" },
                ...services.map((x) => ({ value: x.id, label: x.name })),
              ]}
            />
          ) : null}
          <TextArea
            label="Describe the job"
            name="description"
            required
            rows={5}
            maxlength={3000}
            value={values.description}
            hint="What needs doing, sizes or quantities, and anything we should know about access."
          />
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
              aria-describedby="f-photos-hint"
              class="block w-full rounded-xl border border-gray-400 bg-white p-2 text-base file:mr-3 file:rounded-lg file:border-0 file:bg-primary-100 file:px-3 file:py-2 file:font-semibold file:text-primary-dark"
            />
            <p id="f-photos-hint" class="mt-1 text-sm text-gray-700">
              Photos help us quote without a visit. Each photo must be 10 MB or smaller.
            </p>
            <p data-photo-status class="mt-1 text-sm text-gray-700" aria-live="polite"></p>
          </div>
          <Field
            label="Address or suburb"
            name="address"
            autocomplete="street-address"
            maxlength={200}
            value={values.address}
          />
          <fieldset class="mb-4">
            <legend class="mb-1 text-sm font-medium">How soon do you need it?</legend>
            {URGENCIES.map((u) => (
              <label class="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="urgency"
                  value={u}
                  checked={(values.urgency ?? "flexible") === u}
                  class="size-5 accent-primary"
                />
                {urgencyQuestion[u]}
              </label>
            ))}
          </fieldset>
          <Field
            label="Days or times that suit you"
            name="preferredTime"
            maxlength={200}
            value={values.preferredTime}
          />
          <Checkbox
            name="consent"
            label="You can contact me about this enquiry."
            hint="We only use your details to reply to this enquiry, send your quote and arrange the work."
          />
          <Button full>Send enquiry</Button>
          <p class="mt-3 text-sm text-gray-700">
            By sending this you agree to our{" "}
            <a class="underline" href="/privacy">
              privacy notice
            </a>{" "}
            and{" "}
            <a class="underline" href="/terms">
              terms
            </a>
            .
          </p>
        </form>
      </Card>
      {s.phone ? (
        <p class="mt-4 text-center text-gray-800">
          Prefer to talk? Call{" "}
          <a class="font-semibold text-primary underline" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>
            {s.phone}
          </a>
        </p>
      ) : null}
    </>
  );
};

publicRoutes.get("/enquire", async (c) => {
  const s = c.get("settings");
  const services = await listServices(c.get("db"), true);
  return render(
    c,
    { title: "Get a quote", publicPage: true, description: `Ask ${s.businessName} for a quote.` },
    <EnquiryForm c={c} s={s} services={services} />,
  );
});

publicRoutes.post("/enquire", async (c) => {
  const s = c.get("settings");
  const db = c.get("db");
  const body = await formBody(c);
  const values = formValues(body);
  const services = await listServices(db, true);
  const fail = (error: string, status: 400 | 429 = 400) =>
    render(
      c,
      { title: "Get a quote", publicPage: true, status },
      <EnquiryForm c={c} s={s} services={services} values={values} error={error} />,
    );
  if (await rateLimited(c, "enquire", "PUBLIC_LIMITER")) return fail(TOO_MANY, 429);
  const parsed = enquirySchema.safeParse(values);
  if (!parsed.success) return fail(firstError(parsed.error));
  // A filled trap field means a bot. Say thanks and save nothing.
  if (parsed.data.website) return c.redirect("/enquire/thanks", 303);
  const photos = validatePhotos(formFiles(body, "photos"));
  if (!photos.ok) return fail(photos.message);
  const svc = parsed.data.serviceId ? services.find((x) => x.id === parsed.data.serviceId) : undefined;
  const keys: string[] = [];
  for (const file of photos.files) keys.push(await storePhoto(c.env.PHOTOS, file));
  const row = await createLead(
    db,
    c.env.DB,
    {
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      serviceId: svc?.id ?? null,
      serviceName: svc?.name ?? "",
      description: parsed.data.description,
      address: parsed.data.address,
      urgency: parsed.data.urgency,
      preferredTime: parsed.data.preferredTime,
      source: "form",
    },
    keys,
    "",
  );
  const origin = appOrigin(c.env, c.get("origin"));
  c.executionCtx.waitUntil(
    Promise.all([alertNewLead(c.env, db, s, row, origin), confirmEnquiry(c.env, s, row)]).then(() => undefined),
  );
  return c.redirect("/enquire/thanks", 303);
});

publicRoutes.get("/enquire/thanks", (c) => {
  const s = c.get("settings");
  return render(
    c,
    { title: "Enquiry sent", publicPage: true },
    <Card>
      <h1 class="text-2xl font-bold text-navy">Thanks, we have your enquiry</h1>
      <p class="mt-2 text-gray-800">
        {s.businessName} will reply soon. If you gave an email address, a confirmation is on its way.
      </p>
      {s.phone ? (
        <p class="mt-2 text-gray-800">
          If it is urgent, call{" "}
          <a class="font-semibold text-primary underline" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>
            {s.phone}
          </a>
          .
        </p>
      ) : null}
    </Card>,
  );
});

// ---------- Customer quote page ----------

const QuotePage = ({
  c,
  detail,
  error,
  notice,
}: {
  c: Context<AppEnv>;
  detail: LeadDetail;
  error?: string | undefined;
  notice?: string | undefined;
}) => {
  const s = c.get("settings");
  const tz = c.get("timeZone");
  const { lead: row, items } = detail;
  const t = quoteTotals(items, s);
  const expired = quoteExpired(row, tz);
  const open = row.status === "quoted" && !row.acceptedAt && !expired;
  const money = (cents: number) => formatMoney(cents, s.currency);
  return (
    <>
      <div class="mb-5 rounded-2xl bg-navy-800 px-5 py-5 text-white shadow-md">
        <p class="text-sm font-semibold uppercase tracking-wide text-accent">Quote #{row.number}</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">Your quote, {row.customerName}</h1>
        {row.quoteValidUntil ? (
          <p class="mt-1 text-navy-200">
            {expired ? "Expired on " : "Valid until "}
            {formatDay(row.quoteValidUntil)}
          </p>
        ) : null}
      </div>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {row.acceptedAt ? (
        <Alert tone="success">
          Accepted by {row.acceptedName}. Thank you.{" "}
          {row.scheduledFor
            ? `Your visit is booked for ${formatLocal(row.scheduledFor)}.`
            : "We will be in touch to book a time."}
        </Alert>
      ) : null}
      {row.status === "lost" ? <Alert tone="info">This quote is closed.</Alert> : null}
      {expired && !row.acceptedAt ? (
        <Alert tone="warning">This quote has expired. Reply to our email or call us for an updated one.</Alert>
      ) : null}

      <form method="post" action={`/q/${row.publicToken}/accept`} data-enhance>
        <Csrf token={c.get("csrfToken")} />
        <Card class="mb-4" label="Quote details">
          {row.quoteSummary ? <p class="mb-4 whitespace-pre-line text-gray-900">{row.quoteSummary}</p> : null}
          {items.length ? (
            <table class="w-full text-left text-sm">
              <caption class="sr-only">Quote lines</caption>
              <thead>
                <tr class="border-b border-line text-gray-700">
                  <th scope="col" class="py-2 pr-2 font-medium">
                    Item
                  </th>
                  <th scope="col" class="py-2 pl-2 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr class="border-b border-line/60">
                    <td class="py-2 pr-2">
                      {i.description}
                      {i.qtyHundredths !== 100 ? (
                        <span class="block text-xs text-gray-700">
                          {i.qtyHundredths / 100} x {money(i.unitCents)}
                        </span>
                      ) : null}
                    </td>
                    <td class="py-2 pl-2 text-right tabular-nums">{money(lineCents(i))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
        <Card class="mb-4" label="Total">
          <dl class="space-y-1 text-sm">
            {s.taxRateBp > 0 ? (
              <>
                <div class="flex justify-between">
                  <dt>{s.pricesIncludeTax ? "Total before tax" : "Subtotal"}</dt>
                  <dd class="tabular-nums">{money(t.netCents)}</dd>
                </div>
                <div class="flex justify-between">
                  <dt>
                    {s.taxLabel || "Tax"} ({s.taxRateBp / 100}%)
                  </dt>
                  <dd class="tabular-nums">{money(t.taxCents)}</dd>
                </div>
              </>
            ) : null}
            <div class={`flex justify-between text-lg font-bold ${s.taxRateBp > 0 ? "border-t border-line pt-2" : ""}`}>
              <dt>Total</dt>
              <dd class="tabular-nums">{money(t.totalCents)}</dd>
            </div>
          </dl>
        </Card>

        {open ? (
          <Card class="mb-4" label="Accept this quote">
            <H2>Accept this quote</H2>
            <Field label="Your full name" name="acceptedName" required autocomplete="name" maxlength={80} />
            <TextArea
              label="Message for us"
              name="customerReply"
              maxlength={1000}
              rows={3}
              hint="For example days and times that suit you for the work."
            />
            <Checkbox name="agree" label="I accept this quote and the total shown." />
            <Button full>Accept quote</Button>
          </Card>
        ) : null}
      </form>

      {open ? (
        <details class="mb-4 rounded-2xl border border-line bg-white p-4">
          <summary class="cursor-pointer font-semibold text-navy">Not for you? Let us know</summary>
          <form method="post" action={`/q/${row.publicToken}/decline`} class="mt-3" data-enhance>
            <Csrf token={c.get("csrfToken")} />
            <TextArea label="Anything we could do differently?" name="customerReply" maxlength={1000} rows={3} />
            <Button kind="secondary" confirm="Decline this quote?">
              Decline quote
            </Button>
          </form>
        </details>
      ) : null}

      {detail.photos.length > 0 ? (
        <Card class="mb-4" label="Your photos">
          <H2>Your photos</H2>
          <ul class="grid grid-cols-3 gap-2">
            {detail.photos.map((p, i) => (
              <li>
                <img
                  src={`/q/${row.publicToken}/photo/${p.id}`}
                  alt={`Photo ${i + 1} you sent with your enquiry`}
                  loading="lazy"
                  class="aspect-square w-full rounded-lg object-cover"
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div class="mb-4 flex flex-wrap justify-center gap-2 print:hidden">
        <button type="button" class={btn("secondary")} data-print>
          Print or save as PDF
        </button>
      </div>
      <p class="text-center text-sm text-gray-800">
        Questions? {s.phone ? <>Call {s.phone} or reply</> : <>Reply</>} to the email this link came in.
      </p>
    </>
  );
};

/** Looks up the lead for a quote link. Drafts that were never sent are not visible to the customer. */
async function quoteFor(c: Context<AppEnv>): Promise<LeadDetail | null> {
  const detail = await getLeadByToken(c.get("db"), c.req.param("token") ?? "");
  if (!detail || !detail.lead.quoteSentAt) return null;
  return detail;
}

const showQuote = (
  c: Context<AppEnv>,
  detail: LeadDetail,
  opts: { error?: string; notice?: string; status?: 200 | 400 | 409 | 429 } = {},
) =>
  render(
    c,
    { title: `Quote #${detail.lead.number}`, publicPage: true, status: opts.status ?? 200 },
    <QuotePage c={c} detail={detail} error={opts.error} notice={opts.notice} />,
  );

const NOTICES: Record<string, string> = {
  accepted: "Thank you. Your quote is accepted.",
  declined: "Thanks for letting us know.",
};

publicRoutes.get("/q/:token", async (c) => {
  const detail = await quoteFor(c);
  if (!detail) return c.notFound();
  return showQuote(c, detail, { notice: NOTICES[c.req.query("m") ?? ""] });
});

publicRoutes.post("/q/:token/accept", async (c) => {
  const detail = await quoteFor(c);
  if (!detail) return c.notFound();
  const fail = (error: string, status: 400 | 409 | 429 = 400) => showQuote(c, detail, { error, status });
  if (await rateLimited(c, "quote", "PUBLIC_LIMITER")) return fail(TOO_MANY, 429);
  const values = formValues(await formBody(c));
  const parsed = acceptSchema.safeParse(values);
  if (!parsed.success) return fail(firstError(parsed.error));
  const s = c.get("settings");
  const r = await acceptQuote(
    c.get("db"),
    detail,
    s,
    { acceptedName: parsed.data.acceptedName, customerReply: parsed.data.customerReply },
    c.get("timeZone"),
  );
  if (!r.ok) return fail(r.message, 409);
  const fresh = await getLeadByToken(c.get("db"), detail.lead.publicToken);
  if (fresh)
    c.executionCtx.waitUntil(alertAccepted(c.env, c.get("db"), s, fresh.lead, appOrigin(c.env, c.get("origin"))));
  return c.redirect(`/q/${detail.lead.publicToken}?m=accepted`, 303);
});

publicRoutes.post("/q/:token/decline", async (c) => {
  const detail = await quoteFor(c);
  if (!detail) return c.notFound();
  const fail = (error: string, status: 400 | 409 | 429 = 400) => showQuote(c, detail, { error, status });
  if (await rateLimited(c, "quote", "PUBLIC_LIMITER")) return fail(TOO_MANY, 429);
  const parsed = declineSchema.safeParse(formValues(await formBody(c)));
  if (!parsed.success) return fail(firstError(parsed.error));
  const r = await declineQuote(c.get("db"), detail, parsed.data.customerReply);
  if (!r.ok) return fail(r.message, 409);
  const fresh = await getLeadByToken(c.get("db"), detail.lead.publicToken);
  if (fresh) c.executionCtx.waitUntil(alertDeclined(c.env, c.get("db"), fresh.lead, appOrigin(c.env, c.get("origin"))));
  return c.redirect(`/q/${detail.lead.publicToken}?m=declined`, 303);
});

/** The customer's own photos, through their quote link only. */
publicRoutes.get("/q/:token/photo/:photoId", async (c) => {
  const detail = await quoteFor(c);
  const pid = idSchema.safeParse(c.req.param("photoId"));
  if (!detail || !pid.success) return c.notFound();
  const photo = detail.photos.find((p) => p.id === pid.data);
  if (!photo) return c.notFound();
  return (await photoResponse(c.env.PHOTOS, photo.key)) ?? c.notFound();
});
