# Setting up CatchDesk Lite

This guide takes you from the code to your own live CatchDesk Lite, step by step. You do not need to be a developer.
Each command is explained in plain words. Expect about 20 minutes the first time, plus 15 for email.

Everything runs in **your own Cloudflare account**. A small business fits in Cloudflare's free plan.

## The quickest way: the Deploy to Cloudflare button

If you have a Cloudflare account and a GitHub account, you can skip most of this guide:

1. Click **Deploy to Cloudflare** in the README.
2. Sign in to Cloudflare and connect GitHub when asked. Cloudflare copies CatchDesk Lite into a new repository in your
   GitHub account and creates the database and photo storage for you.
3. When it asks for **AUTH_SECRET**, paste a long random string of at least 32 characters (see Step 4 below for a
   one-line way to make one). Do not keep the example value: CatchDesk refuses to start with it.
4. Click **Create and deploy** and wait a few minutes. Open the address it shows and create your account. The first
   account becomes the admin. Then carry on from Step 6 below.

Every change you push to that GitHub repository deploys automatically. The rest of this guide is the manual way, which
gives you a copy on your own computer as well.

## What you need

1. **A Cloudflare account.** Free. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Node.js 22.18 or newer.** This runs the setup tools on your computer. Download the "LTS" version from
   [nodejs.org](https://nodejs.org) and install it with the default options.
3. **The CatchDesk Lite code** in a folder on your computer. On the GitHub page, click the green **Code** button, then
   **Download ZIP**, and unzip it (or `git clone` it).

To run the commands below, open a terminal in the CatchDesk Lite folder:

- **Windows:** open the folder in File Explorer, click the address bar, type `powershell` and press Enter.
- **Mac:** right-click the folder in Finder and choose "New Terminal at Folder".

## Step 1: Install the tools

```bash
npm install
```

This downloads the libraries CatchDesk uses into a `node_modules` folder. It takes a minute or two.

## Step 2: Try it on your computer (optional)

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

- The first line makes a settings file for local testing. On Windows PowerShell use
  `Copy-Item .dev.vars.example .dev.vars` instead.
- The second line builds the styles, creates a local database and starts CatchDesk on your computer.

Open [http://localhost:8787](http://localhost:8787). Create an account: the **first account becomes the admin**.
Press `Ctrl + C` in the terminal to stop it. Want sample data? Run `npm run seed:local` (this wipes your local test
database first).

## Step 3: Sign in to Cloudflare

```bash
npx wrangler login
```

This opens your browser and asks you to allow Wrangler (Cloudflare's command-line tool) to manage your account.
Click **Allow**. Nothing is deployed yet.

## Step 4: Set the secret key

CatchDesk needs one secret: a long random string that protects sign-in sessions. Never share it or put it in the
code.

```bash
npx wrangler secret put AUTH_SECRET
```

It asks for a value. Paste a long random string (40 characters or more) and press Enter. Nothing shows as you paste;
that is normal. To make one:

- **Mac or Linux:** run `openssl rand -hex 32` and copy the result.
- **Windows PowerShell:** run
  `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { '{0:x2}' -f $_ })`
  and copy the result.

The first time, Wrangler may ask whether to create the Worker. Answer **yes**.

## Step 5: Deploy

The very first time, run these two commands, one after the other:

```bash
npm run build:css
npx wrangler deploy
```

This uploads CatchDesk and creates its database and photo storage in your account. It prints your address, like
`https://catchdesk.your-name.workers.dev`. Do not open it yet: the database is still empty. Then run:

```bash
npm run deploy
```

This sets up the database tables, then uploads CatchDesk again. From now on this is the only command you need to
publish changes: it always updates the database before the code.

Now open your address and create your account. The first account becomes the admin.

## Step 6: Make it yours

Signed in as the admin, open **Settings**:

1. **Business:** your business name, the email customers reply to, your phone number and time zone.
2. **Prices and tax:** currency, tax name and rate (for example Sales tax 8.25, or GST 10 with "prices include tax"),
   and how long quotes stay valid.
3. **Services:** add what you offer, or start from a ready-made list. Customers pick one on the form, and the usual
   price is a quick pick when you build a quote.
4. **Enquiry form:** the intro text at the top of the form, and whether to email the team about each new enquiry.
5. **Team:** people sign up at your address, then appear here. Make them **Staff** (work leads) or **Owner or admin**
   (also settings, deleting and the team).

Then share your enquiry form: copy the link from **Today** or **Settings** and put it on your website, social pages,
email signature or a QR code.

## Email (needed for alerts and quote emails)

CatchDesk Lite sends:

- **New enquiry** alerts to your team.
- **"We got your enquiry"** to the customer.
- **Your quote**, with a link to accept online.
- **Quote accepted** and **quote declined** to your team, and a thank-you to the customer.
- **Booking confirmed** to the customer.
- **Password reset** links, and **confirm your email** for new sign-ups if you switch it on.

Customer emails come from your business name and replies go to the email in Settings. Without email set up the app
still works: the lead page tells you to copy the customer's link and send it yourself, and emails are written to the
Worker log instead of being sent.

You need a domain on Cloudflare (for example `yourbusiness.com`). It takes about 15 minutes:

1. **Turn on Email Sending for your domain.** Run `npx wrangler email sending enable yourbusiness.com`, or use the
   Email Service section of the Cloudflare dashboard. Check the records are there with
   `npx wrangler email sending dns get yourbusiness.com`. If your DNS is not on Cloudflare, add those records at your
   DNS provider.
2. **Choose the address emails come from**, such as `quotes@yourbusiness.com`, on the same domain.
3. **Edit `wrangler.jsonc`:**
   - uncomment `"send_email": [{ "name": "EMAIL" }],`
   - set `"MAIL_FROM"` to the address from step 2
   - set `"APP_URL"` to your CatchDesk address, such as `"https://quotes.yourbusiness.com"`, so links in emails
     always point to the right place.
4. **Deploy:** `npm run deploy`.
5. **Test it.** Send an enquiry from your own form with your own email. You should get "We got your enquiry", and
   your team should get the alert, within a minute. If nothing arrives, look for `email_failed` in the Worker logs
   (Cloudflare dashboard, Workers & Pages, catchdesk, Logs).

There are no API keys for email: the `send_email` binding uses your Cloudflare account directly.

## Optional: use your own web address

In the Cloudflare dashboard, open **Workers & Pages**, click **catchdesk**, then **Settings**, then **Domains &
Routes**, then **Add**, then **Custom domain**. Enter something like `quotes.yourbusiness.com`. Then set `APP_URL` in
`wrangler.jsonc` to that address and run `npm run deploy` again.

## Updating

When a new version is released, download it again (or `git pull`), copy your `wrangler.jsonc` settings across if you
changed them, then run:

```bash
npm install
npm run deploy
```

`npm run deploy` applies any database changes before uploading, and never deletes your data.

## Privacy

CatchDesk ships with starting wording for the Privacy and Terms pages (`/privacy` and `/terms`, in
`src/routes/misc.tsx`). Check it suits your business and your local law, and add your own details, before you share
the form. CatchDesk Lite stores:

- **Customer details** from each enquiry: name, email, phone, address, the job description and photos.
- **Quotes**, and the customer's answer: their typed name and any message.
- **Team accounts:** names and email addresses.

Photos are private files in your R2 bucket. Your team can see them, and the customer can see their own through their
quote link. Quote links are long random addresses that cannot be guessed; anyone who has a link can see that quote,
so customers should not share it.

**How long data is kept:** until you delete it. An admin can delete a lead (with its quote, timeline and photos) from
the bottom of the lead page.

## Backups

Cloudflare D1 keeps 30 days of point-in-time history automatically. See
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/). To export a copy:

```bash
npx wrangler d1 export DB --remote --output=catchdesk-backup.sql
```

## Something not working?

- **"Please sign in" loops, or "This form has expired":** make sure `AUTH_SECRET` is set (Step 4) and refresh.
- **Emails never arrive:** check the email steps above, and look for `email_failed` in the logs.
- **See what went wrong:** Cloudflare dashboard, then **Workers & Pages**, then **catchdesk**, then **Logs**.
- **Run the tests:** `npm test` checks the business rules and permissions on your computer.

## For developers

```bash
npm run dev          # local app at http://localhost:8787 (copy .dev.vars.example to .dev.vars first)
npm run seed:local   # sample business and leads in the local database
npm run check        # type check, lint, formatting and unit tests
npm run test:e2e     # browser tests with accessibility checks (uses Microsoft Edge or Chrome)
```

Project layout:

```
src/
  index.ts          app entry: security headers, middleware, routes, error pages, daily cron (demo only)
  labels.ts         every status, role and caption
  db/schema.ts      database tables
  lib/can.ts        every permission rule
  services/         business logic: leads and quotes, settings, team, emails, demo reset
  routes/           pages and form handlers
  views/            shared layout and components
migrations/         SQL migrations applied by Wrangler
test/               unit and route tests (Workers runtime, real local D1 and R2)
e2e/                Playwright end-to-end tests at desktop and phone width
```

## Demo mode (for showing CatchDesk off, not for a real business)

Setting `"DEMO_MODE": "true"` adds one-click demo sign-ins, turns off sign-up, never sends any email, and wipes and
reloads sample data every day at 15:00 UTC. Load the sample data the first time with `npm run seed:remote -- --yes`.
**Never turn this on for a real business:** it deletes everything nightly.
