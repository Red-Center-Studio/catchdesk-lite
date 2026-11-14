# Customising CatchDesk Lite

Most changes need no code: business details, tax, services, the form intro and the team are all on the **Settings**
page. This guide covers changes in the code. After any change run `npm run check`, then `npm run deploy`.

## Words, statuses and roles

Every caption lives in `src/labels.ts`: status names and the "what to do next" line under each, urgency wording,
sources, lost reasons, role names and the ready-made service lists. Change only the text on the right; the keys on the
left are stored in the database.

## Colours and branding

Colours are in `src/styles/input.css` under `@theme`. `primary` is buttons and links, `navy` the header and banners,
`accent` the highlight. Keep text contrast at 4.5:1 or more (WebAIM's contrast checker helps). The logo is the
`Logo` component in `src/views/layout.tsx` and `public/favicon.svg`. Email colours are in `src/lib/email.ts`.

## The enquiry form

The form is `EnquiryForm` in `src/routes/public.tsx`, and its rules are `enquirySchema` in `src/lib/validate.ts`. To
add a question, add a field to both, add a column to `lead` in `src/db/schema.ts` (see "Database changes"), and save
it in the `POST /enquire` handler.

To put a button on your website, copy the snippet from **Settings, Enquiry form**.

## Quotes

Quote maths (lines, tax added or included) is in `src/lib/money.ts`. Money is stored as whole cents and quantities as
hundredths, so totals always add up. The quote builder is the `LeadPage` component in `src/routes/leads.tsx`, and the
customer's quote page is `QuotePage` in `src/routes/public.tsx`.

## Emails

Every email is in `src/services/notify.ts`, written in plain words with a text and an HTML version. Change the wording
there. Password emails are in `src/auth/auth.ts`.

To use Resend or another provider instead of Cloudflare Email Sending, replace the body of `sendEmail` in
`src/lib/email.ts` with a `fetch` to that provider's API, and store its key with `npx wrangler secret put`.

## Terms and privacy pages

Starting wording in `src/routes/misc.tsx`. Check it suits your business and your local law, and add your own details,
before you share the form.

## Permissions

Every rule is in `src/lib/can.ts`, with a table at the top. Routes check permissions on the server, so hiding a button
is never the only protection.

## Database changes

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate`. This writes a new SQL file in `migrations/`.
3. Run `npm run db:migrate:local` to try it, then `npm run deploy` to apply it live.

Never edit a migration that has already been applied; add a new one.

## Checks before you deploy

```bash
npm run check      # type check, lint and the unit tests
npm run test:e2e   # the browser tests, including accessibility checks
```
