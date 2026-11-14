import { Hono } from "hono";
import type { AppEnv } from "../env";
import { H1 } from "../views/components";
import { render } from "./render";

export const miscRoutes = new Hono<AppEnv>();

// ---------- Legal pages: placeholders the business edits ----------

miscRoutes.get("/terms", async (c) => {
  const s = c.get("settings");
  return render(
    c,
    { title: "Terms", publicPage: !c.get("user") },
    <article>
      <H1 sub="Starting wording. Check it suits your business and your local law before you go live.">Terms</H1>
      <div class="space-y-3 text-gray-800">
        <h2 class="text-lg font-bold text-navy">Quotes</h2>
        <p>
          Quotes sent through this site are offers from {s.businessName}. A quote is valid until the date shown on it,
          for the work described, and is based on the details and photos you sent. If the job turns out different once
          we see it, we will tell you and agree any change with you before doing the extra work.
        </p>
        <p>
          Accepting a quote online, by typing your name and ticking the box, means you agree to the work and the total
          shown.
        </p>
        <p>To edit this page, change src/routes/misc.tsx in the code.</p>
      </div>
    </article>,
  );
});

miscRoutes.get("/privacy", async (c) => {
  const s = c.get("settings");
  const contact = s.supportEmail ? (
    <>
      email{" "}
      <a class="text-primary underline" href={`mailto:${s.supportEmail}`}>
        {s.supportEmail}
      </a>
    </>
  ) : (
    <>contact us</>
  );
  return render(
    c,
    { title: "Privacy", publicPage: !c.get("user") },
    <article>
      <H1 sub="Starting wording. Check it suits your business and your local law before you go live.">Privacy</H1>
      <div class="space-y-3 text-gray-800">
        <h2 class="text-lg font-bold text-navy">What we collect</h2>
        <p>
          When you send an enquiry, {s.businessName} stores your name, contact details, address, the job description,
          and any photos you add. When you answer a quote we store your answer, your typed name and any message you
          write.
        </p>
        <h2 class="text-lg font-bold text-navy">How we use it</h2>
        <p>
          Only to reply to you, quote, book and do the work. We do not sell your details or use them for advertising.
        </p>
        <h2 class="text-lg font-bold text-navy">Who handles it for us</h2>
        <p>Your data is stored in {s.businessName}'s own Cloudflare account. Emails are sent with Cloudflare.</p>
        <h2 class="text-lg font-bold text-navy">Photos and links</h2>
        <p>
          Photos are private files. Our team can see them, and you can see your photos through your own quote link. Your
          quote link is long and random so it cannot be guessed; please do not share it.
        </p>
        <h2 class="text-lg font-bold text-navy">Your choices</h2>
        <p>
          To see, correct or delete your details, {contact}. We keep enquiry records until you ask us to delete them, or
          we no longer need them for the job, warranty or legal reasons.
        </p>
        <p>To edit this page, change src/routes/misc.tsx in the code.</p>
      </div>
    </article>,
  );
});

miscRoutes.get("/healthz", (c) => c.json({ ok: true }));
miscRoutes.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 301));
