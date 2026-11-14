import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { me, requirePermission } from "../lib/middleware";
import { bpToPercent, centsToInput, formatMoney } from "../lib/money";
import {
  businessSchema,
  enquiryFormSchema,
  firstError,
  formValues,
  id as idSchema,
  moveSchema,
  pricingSchema,
  roleSchema,
  serviceSchema,
  templateSchema,
} from "../lib/validate";
import { CURRENCIES, PENDING_LABEL, ROLES, SERVICE_TEMPLATES, roleLabel } from "../labels";
import {
  addService,
  addServiceTemplate,
  deleteService,
  listServices,
  moveService,
  toggleService,
  updateService,
  updateSettings,
  type Result,
} from "../services/settings";
import { listTeam, setRole } from "../services/team";
import { appOrigin } from "../auth/auth";
import { Alert, btn, Button, Card, Checkbox, Csrf, Field, H1, H2, Select, TextArea } from "../views/components";
import { formBody, render } from "./render";

export const settingsRoutes = new Hono<AppEnv>();

const admin = requirePermission("settings:edit");

const COMMON_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Pacific/Auckland",
  "Asia/Singapore",
];

const SettingsPage = async ({
  c,
  error,
  section,
}: {
  c: Context<AppEnv>;
  error?: string | undefined;
  section?: string;
}) => {
  const s = c.get("settings");
  const db = c.get("db");
  const [services, team] = await Promise.all([listServices(db), listTeam(db, me(c))]);
  const m = c.req.query("m");
  const origin = appOrigin(c.env, c.get("origin"));
  const err = (name: string) => (error && section === name ? <Alert tone="error">{error}</Alert> : null);
  return (
    <>
      <H1 sub="Your business details, prices, services, enquiry form and team.">Settings</H1>
      {m ? <Alert tone="success">Saved.</Alert> : null}
      <nav aria-label="Settings sections" class="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          ["#business", "Business"],
          ["#pricing", "Prices and tax"],
          ["#services", "Services"],
          ["#form", "Enquiry form"],
          ["#team", "Team"],
        ].map(([href, label]) => (
          <a
            class="inline-flex min-h-11 items-center rounded-full bg-white px-3 py-2 text-primary underline-offset-2 hover:underline"
            href={href}
          >
            {label}
          </a>
        ))}
      </nav>
      <div class="grid gap-4">
        <Card id="business">
          <H2>Business</H2>
          {err("business")}
          <form method="post" action="/settings/business" data-enhance>
            <Csrf token={c.get("csrfToken")} />
            <Field label="Business name" name="businessName" required maxlength={80} value={s.businessName} />
            <div class="grid gap-x-4 sm:grid-cols-2">
              <Field
                label="Email for customer replies"
                name="supportEmail"
                type="email"
                maxlength={254}
                value={s.supportEmail}
                hint="Customers reply to this address."
              />
              <Field label="Phone shown to customers" name="phone" type="tel" maxlength={40} value={s.phone} />
            </div>
            <Field
              label="Time zone"
              name="timeZone"
              list="zones"
              maxlength={64}
              value={s.timeZone}
              hint={`Leave empty to use ${c.env.TIME_ZONE || "UTC"} from wrangler.jsonc.`}
            />
            <datalist id="zones">
              {COMMON_ZONES.map((z) => (
                <option value={z} />
              ))}
            </datalist>
            <Checkbox
              name="showSetupOffer"
              checked={s.showSetupOffer}
              label="Show the setup help link to admins"
              hint="A small link on the Account page to Red Center Studio's paid setup help."
            />
            <Button>Save business details</Button>
          </form>
        </Card>

        <Card id="pricing">
          <H2>Prices and tax</H2>
          <p class="mb-3 text-sm text-gray-700">
            Used on every quote. Changing them does not change quotes already sent.
          </p>
          {err("pricing")}
          <form method="post" action="/settings/pricing" data-enhance>
            <Csrf token={c.get("csrfToken")} />
            <div class="grid gap-x-4 sm:grid-cols-3">
              <Select
                label="Currency"
                name="currency"
                required
                value={s.currency}
                options={CURRENCIES.map((x) => ({ value: x, label: x }))}
              />
              <Field
                label="Tax name"
                name="taxLabel"
                maxlength={20}
                value={s.taxLabel}
                hint="For example Sales tax, GST or VAT."
              />
              <Field
                label="Tax rate (%)"
                name="taxRate"
                inputmode="decimal"
                maxlength={5}
                value={bpToPercent(s.taxRateBp)}
                hint="0 hides the tax line."
              />
            </div>
            <Checkbox
              name="pricesIncludeTax"
              checked={s.pricesIncludeTax}
              label="My prices already include tax"
              hint="Common for GST and VAT. Leave unticked to add tax on top."
            />
            <Field
              label="Quotes valid for (days)"
              name="quoteValidDays"
              inputmode="numeric"
              maxlength={3}
              value={s.quoteValidDays}
              required
            />
            <Button>Save prices</Button>
          </form>
        </Card>

        <Card id="services">
          <H2>Services</H2>
          <p class="mb-3 text-sm text-gray-700">
            Customers pick one on the enquiry form. The usual price is offered as a quick pick when you build a quote.
          </p>
          {err("services")}
          {services.length ? (
            <ul class="mb-4 space-y-3">
              {services.map((x, i) => (
                <li class={`rounded-xl border border-line p-3 ${x.active ? "" : "bg-gray-50"}`}>
                  <form method="post" action={`/settings/services/${x.id}`} data-enhance>
                    <Csrf token={c.get("csrfToken")} />
                    <div class="grid gap-x-3 sm:grid-cols-[2fr_1fr]">
                      <Field label="Name" name="name" id={`sn-${x.id}`} required maxlength={100} value={x.name} />
                      <Field
                        label="Usual price"
                        name="basePrice"
                        id={`sp-${x.id}`}
                        inputmode="decimal"
                        maxlength={12}
                        value={centsToInput(x.basePriceCents)}
                      />
                    </div>
                    <Field
                      label="Description"
                      name="description"
                      id={`sd-${x.id}`}
                      maxlength={300}
                      value={x.description}
                    />
                    <div class="flex flex-wrap gap-2">
                      <Button kind="secondary">Save</Button>
                      <Button kind="ghost" formaction={`/settings/services/${x.id}/toggle`}>
                        {x.active ? "Hide from the form" : "Show on the form"}
                      </Button>
                      {i > 0 ? (
                        <Button kind="ghost" formaction={`/settings/services/${x.id}/move`} name="direction" value="up">
                          Move up<span class="sr-only"> {x.name}</span>
                        </Button>
                      ) : null}
                      {i < services.length - 1 ? (
                        <Button
                          kind="ghost"
                          formaction={`/settings/services/${x.id}/move`}
                          name="direction"
                          value="down"
                        >
                          Move down<span class="sr-only"> {x.name}</span>
                        </Button>
                      ) : null}
                      <Button
                        kind="danger"
                        formaction={`/settings/services/${x.id}/delete`}
                        confirm={`Delete ${x.name}? Leads keep the name.`}
                      >
                        Delete
                      </Button>
                    </div>
                    {x.active ? null : <p class="mt-2 text-sm text-gray-700">Hidden from the enquiry form.</p>}
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p class="mb-4 text-sm text-gray-800">No services yet. Add your own, or start from a ready-made list.</p>
          )}
          <form method="post" action="/settings/services" class="mb-4 rounded-xl bg-primary-50 p-3" data-enhance>
            <Csrf token={c.get("csrfToken")} />
            <p class="mb-2 font-semibold">Add a service</p>
            <div class="grid gap-x-3 sm:grid-cols-[2fr_1fr]">
              <Field label="Name" name="name" id="new-name" required maxlength={100} />
              <Field label="Usual price" name="basePrice" id="new-price" inputmode="decimal" maxlength={12} />
            </div>
            <Field label="Description" name="description" id="new-desc" maxlength={300} />
            <Button kind="secondary">Add service</Button>
          </form>
          <form method="post" action="/settings/services/template" class="flex flex-wrap items-end gap-2">
            <Csrf token={c.get("csrfToken")} />
            <Select
              label="Or add a ready-made list"
              name="template"
              required
              class="!mb-0"
              options={Object.entries(SERVICE_TEMPLATES).map(([k, t]) => ({ value: k, label: t.name }))}
            />
            <Button kind="secondary">Add list</Button>
          </form>
        </Card>

        <Card id="form">
          <H2>Enquiry form</H2>
          <p class="mb-2 text-sm text-gray-800">Your form is at:</p>
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <code class="min-w-0 flex-1 break-all rounded-lg bg-primary-50 px-3 py-2 text-sm">{`${origin}/enquire`}</code>
            <button type="button" class={btn("secondary")} data-copy={`${origin}/enquire`}>
              Copy link
            </button>
          </div>
          <details class="mb-4 text-sm">
            <summary class="min-h-11 cursor-pointer py-3 font-medium text-primary">
              Add a button to your website
            </summary>
            <p class="mt-2 text-gray-800">Paste this where you want the button. It opens your form.</p>
            <pre class="mt-2 overflow-x-auto rounded-lg bg-gray-100 p-3 text-xs">
              {`<a href="${origin}/enquire" style="display:inline-block;background:#0f5a4a;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Get a quote</a>`}
            </pre>
          </details>
          {err("form")}
          <form method="post" action="/settings/form" data-enhance>
            <Csrf token={c.get("csrfToken")} />
            <TextArea
              label="Intro at the top of the form"
              name="enquiryIntro"
              maxlength={600}
              rows={2}
              value={s.enquiryIntro}
            />
            <Checkbox name="notifyNewLead" checked={s.notifyNewLead} label="Email the team about each new enquiry" />
            <Button>Save form settings</Button>
          </form>
        </Card>

        <Card id="team">
          <H2>Team</H2>
          <p class="mb-3 text-sm text-gray-800">
            New people sign up at <code>{`${origin}/signup`}</code>, then you give them a role here. Staff can work
            leads; admins can also change settings, delete leads and manage the team.
          </p>
          {err("team")}
          <ul class="space-y-2">
            {team.map((p) => (
              <li class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                <div class="min-w-0">
                  <p class="font-medium">{p.name}</p>
                  <p class="break-all text-sm text-gray-700">
                    {p.email} · {p.role ? roleLabel[p.role] : PENDING_LABEL}
                  </p>
                </div>
                {p.id === me(c).id ? (
                  <span class="text-sm text-gray-700">You</span>
                ) : (
                  <form method="post" action={`/settings/team/${p.id}`} class="flex flex-wrap items-center gap-2">
                    <Csrf token={c.get("csrfToken")} />
                    <label class="sr-only" for={`role-${p.id}`}>
                      Role for {p.name}
                    </label>
                    <select
                      id={`role-${p.id}`}
                      name="role"
                      class="min-h-11 rounded-lg border border-field bg-white px-2 py-2"
                    >
                      {ROLES.map((r) => (
                        <option value={r} selected={p.role === r}>
                          {roleLabel[r]}
                        </option>
                      ))}
                    </select>
                    <Button kind="secondary">{p.role ? "Change role" : "Approve"}</Button>
                    {p.role ? (
                      <Button
                        kind="danger"
                        formaction={`/settings/team/${p.id}/remove`}
                        confirm={`Remove access for ${p.name}?`}
                      >
                        Remove access
                      </Button>
                    ) : null}
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p class="mt-6 text-sm text-gray-700">Prices on quotes show like this: {formatMoney(123456, s.currency)}.</p>
    </>
  );
};

settingsRoutes.get("/settings", admin, async (c) =>
  render(c, { title: "Settings", active: "settings" }, await SettingsPage({ c })),
);

async function done(c: Context<AppEnv>, r: Result<unknown>, section: string) {
  if (r.ok) return c.redirect(`/settings?m=saved#${section}`, 303);
  // Settings changed in this request are not in c.get("settings") yet, but a failed save changed nothing.
  return render(
    c,
    { title: "Settings", active: "settings", status: 400 },
    await SettingsPage({ c, error: r.message, section }),
  );
}

const values = async (c: Context<AppEnv>) => formValues(await formBody(c));

settingsRoutes.post("/settings/business", admin, async (c) => {
  const p = businessSchema.safeParse(await values(c));
  if (!p.success) return done(c, { ok: false, message: firstError(p.error) }, "business");
  const changes: Parameters<typeof updateSettings>[2] = { ...p.data };
  if (me(c).isDemo) delete changes.businessName;
  return done(c, await updateSettings(c.get("db"), me(c), changes), "business");
});

settingsRoutes.post("/settings/pricing", admin, async (c) => {
  const p = pricingSchema.safeParse(await values(c));
  if (!p.success) return done(c, { ok: false, message: firstError(p.error) }, "pricing");
  const d = p.data;
  return done(
    c,
    await updateSettings(c.get("db"), me(c), {
      currency: d.currency,
      taxLabel: d.taxLabel,
      taxRateBp: d.taxRate,
      pricesIncludeTax: d.pricesIncludeTax,
      quoteValidDays: d.quoteValidDays,
    }),
    "pricing",
  );
});

settingsRoutes.post("/settings/form", admin, async (c) => {
  const p = enquiryFormSchema.safeParse(await values(c));
  if (!p.success) return done(c, { ok: false, message: firstError(p.error) }, "form");
  return done(c, await updateSettings(c.get("db"), me(c), p.data), "form");
});

settingsRoutes.post("/settings/services", admin, async (c) => {
  const p = serviceSchema.safeParse(await values(c));
  if (!p.success) return done(c, { ok: false, message: firstError(p.error) }, "services");
  return done(c, await addService(c.get("db"), me(c), p.data), "services");
});

settingsRoutes.post("/settings/services/template", admin, async (c) => {
  const p = templateSchema.safeParse(await values(c));
  if (!p.success) return done(c, { ok: false, message: firstError(p.error) }, "services");
  return done(c, await addServiceTemplate(c.get("db"), me(c), p.data.template), "services");
});

const serviceId = (c: Context<AppEnv>) => idSchema.safeParse(c.req.param("id"));

settingsRoutes.post("/settings/services/:id", admin, async (c) => {
  const sid = serviceId(c);
  if (!sid.success) return c.notFound();
  const p = serviceSchema.safeParse(await values(c));
  if (!p.success) return done(c, { ok: false, message: firstError(p.error) }, "services");
  return done(c, await updateService(c.get("db"), me(c), sid.data, p.data), "services");
});

settingsRoutes.post("/settings/services/:id/toggle", admin, async (c) => {
  const sid = serviceId(c);
  if (!sid.success) return c.notFound();
  return done(c, await toggleService(c.get("db"), me(c), sid.data), "services");
});

settingsRoutes.post("/settings/services/:id/move", admin, async (c) => {
  const sid = serviceId(c);
  if (!sid.success) return c.notFound();
  const p = moveSchema.safeParse(await values(c));
  if (!p.success) return done(c, { ok: false, message: firstError(p.error) }, "services");
  return done(c, await moveService(c.get("db"), me(c), sid.data, p.data.direction), "services");
});

settingsRoutes.post("/settings/services/:id/delete", admin, async (c) => {
  const sid = serviceId(c);
  if (!sid.success) return c.notFound();
  return done(c, await deleteService(c.get("db"), me(c), sid.data), "services");
});

settingsRoutes.post("/settings/team/:id", requirePermission("team:manage"), async (c) => {
  const tid = idSchema.safeParse(c.req.param("id"));
  if (!tid.success) return c.notFound();
  const p = roleSchema.safeParse(await values(c));
  if (!p.success) return done(c, { ok: false, message: firstError(p.error) }, "team");
  return done(c, await setRole(c.get("db"), me(c), tid.data, p.data.role), "team");
});

settingsRoutes.post("/settings/team/:id/remove", requirePermission("team:manage"), async (c) => {
  const tid = idSchema.safeParse(c.req.param("id"));
  if (!tid.success) return c.notFound();
  if (tid.data === me(c).id) return done(c, { ok: false, message: "You cannot remove your own access." }, "team");
  return done(c, await setRole(c.get("db"), me(c), tid.data, null), "team");
});
