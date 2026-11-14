# CatchDesk Lite

A free, open source enquiry inbox and quoting app for small service businesses, running on your own Cloudflare
account: customers send enquiries with photos, you send a quote, they accept it on their phone.

[Live demo](https://catchdesk-demo.redcenterstudio.com) | [Get Pro](https://redcenterstudio.com/products/catchdesk/) |
[Docs](SETUP.md)

The live demo runs CatchDesk Pro, so it also shows the Pro features listed below. Sign in with one click; it resets
every night.

## What Lite does

- **Enquiry form with photos.** One link for your website, social pages or a QR code. Customers give their name,
  contact details, the service they need, a description, an address, how soon they need it and times that suit, plus
  up to six photos (shrunk on the phone before upload). Spam is caught by a hidden trap field and a rate limit, with no
  puzzle for real people.
- **Leads inbox.** Every enquiry in one list with a simple pipeline (New, Needs info, Quote sent, Accepted, Booked,
  Done, Lost), status tabs, search and urgent jobs first. Add phone, email and walk-in leads by hand.
- **Today page.** What needs a reply, accepted jobs to book, quotes waiting on the customer and visits coming up.
- **Simple quotes.** Lines with a quantity and price, a summary in plain words, tax added or included, and an expiry
  date. Your saved services are quick picks with their usual price.
- **Quotes customers accept online.** Each quote has a private link. The customer accepts with their name, or
  declines with a reason, and can print it or save it as a PDF.
- **Booking, notes and history.** Book a visit time, keep private notes, and see a timeline of who did what.
- **Emails.** New enquiry alerts to your team, "we got your enquiry" to the customer, the quote link, accepted and
  declined alerts, and booking confirmations. Everything still works without email set up: copy the quote link and
  send it yourself.
- **Team roles.** Owner or admin, and Staff. New sign-ups wait for approval, and the first account becomes the admin.
- **Private photos.** Stored in your own R2 bucket and only shown to your team, or to the customer through their own
  quote link.

It is server-rendered with one small script and works without JavaScript. Pages are checked with axe for WCAG 2.2
AA at desktop and phone width. It is built with [Hono](https://hono.dev), [Drizzle](https://orm.drizzle.team),
[Better Auth](https://www.better-auth.com), Tailwind CSS and TypeScript in strict mode, on Cloudflare Workers, D1 and
R2. A small business fits in Cloudflare's free plan.

## What Pro adds

CatchDesk Pro is $99 USD once, for one business, with the same "your own Cloudflare account" setup. See
[redcenterstudio.com/products/catchdesk/](https://redcenterstudio.com/products/catchdesk/).

| Feature                                                                    | Lite       | Pro                     |
| -------------------------------------------------------------------------- | ---------- | ----------------------- |
| Enquiry form with up to six photos                                         | Yes        | Yes                     |
| Leads inbox, pipeline, search, notes and timeline                          | Yes        | Yes                     |
| Quotes with lines and tax, accepted online by name                         | Yes        | Yes                     |
| Email alerts, quote emails and booking confirmations                       | Yes        | Yes                     |
| Today page                                                                 | Work lists | Plus win rate and value |
| Good, better, best options, optional extras, quantities the customer sets  | No         | Yes                     |
| Deposits, with payment instructions on the quote                           | No         | Yes                     |
| Drawn signature on acceptance                                              | No         | Yes                     |
| Customer picks a visit time, with a calendar file                          | No         | Yes                     |
| Automatic quote reminders by email                                         | No         | Yes                     |
| Instant automatic reply to new enquiries, your words or AI-written         | No         | Yes                     |
| "Draft this quote for me" from your call-out fee, hourly rate and minimums | No         | Yes                     |
| See when a quote was opened, and how many times                            | No         | Yes                     |
| Customer questions and your answers on the quote page                      | No         | Yes                     |
| Extra questions per service and "usually from" prices on the form          | No         | Yes                     |
| Assign leads to staff                                                      | No         | Yes                     |
| Lead source tags (`?src=facebook`) and a report of where work comes from   | No         | Yes                     |
| CSV export of every lead                                                   | No         | Yes                     |
| Text messages to customers, with consent and opt-out                       | No         | Yes                     |
| Optional Workers AI for hour estimates, summaries and replies              | No         | Yes                     |
| Licence                                                                    | MIT        | One business            |

## Deploy in 5 minutes

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Red-Center-Studio/catchdesk-lite)

Click the button. Cloudflare copies this repository into your GitHub account, creates the database and photo
storage, and asks for one secret: `AUTH_SECRET`. Paste a long random string of at least 32 characters (for example
the output of `openssl rand -hex 32`). When it finishes, open the address it gives you and create the first account:
it becomes the admin. Then add your business name, prices and services in **Settings** and share your enquiry form
link.

Manual steps, with Node.js 22.18 or newer:

```bash
npm install
npx wrangler login
npx wrangler secret put AUTH_SECRET
npm run build:css && npx wrangler deploy   # first time only: creates the database and photo bucket
npm run deploy                             # applies migrations, then deploys
```

[SETUP.md](SETUP.md) walks through every step in plain words, including email, your own domain and local
development. [CUSTOMISING.md](CUSTOMISING.md) covers wording, colours, the form, emails and the database.

## Need it set up for you?

Red Center Studio offers a Turnkey Setup: CatchDesk installed on your Cloudflare account with your services, prices,
email and domain, ready to take enquiries.
[Book the Turnkey Setup](https://redcenterstudio.com/start/?package=Turnkey%20Setup%20Sprint&for=catchdesk).

## Licence: MIT

See [LICENSE](LICENSE). You can use, change and share this code, including for client work.

Built by Red Center Studio, [redcenterstudio.com](https://redcenterstudio.com)
