import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Bindings } from "./env";
import { createAuth } from "./auth/auth";
import { base, loadSettings, loadUser, verifyCsrf } from "./lib/middleware";
import { forbiddenHtml, notFoundHtml, serverErrorHtml } from "./views/errors";
import { authRoutes } from "./routes/auth";
import { publicRoutes } from "./routes/public";
import { miscRoutes } from "./routes/misc";
import { leadRoutes } from "./routes/leads";
import { settingsRoutes } from "./routes/settings";
import { accountRoutes } from "./routes/account";
import { runScheduled } from "./services/scheduled";

// Six photos of up to 10 MB each, plus the form fields.
const MAX_BODY_BYTES = 64 * 1024 * 1024;

export const app = new Hono<AppEnv>();

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"],
    },
    referrerPolicy: "same-origin",
  }),
);
app.use(base);

// Reject oversized uploads before reading them.
app.use(async (c, next) => {
  const length = Number(c.req.header("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    return c.text("That upload is too big. Use fewer photos, each 10 MB or smaller.", 413);
  }
  await next();
});

// Better Auth only needs two public endpoints: the links in verification and password reset emails.
// Everything else (sign in, sign up and so on) goes through this app's own forms and validation.
app.get("/api/auth/verify-email", (c) => createAuth(c.env, c.get("origin")).handler(c.req.raw));
app.get("/api/auth/reset-password/:token", (c) => createAuth(c.env, c.get("origin")).handler(c.req.raw));
app.all("/api/auth/*", (c) => c.notFound());

// Form posts must come from this site (Origin check) and carry the CSRF token.
app.use(csrf());
app.use(verifyCsrf);
app.use(loadUser);
app.use(loadSettings);

app.route("/", authRoutes);
app.route("/", publicRoutes);
app.route("/", miscRoutes);
app.route("/", leadRoutes);
app.route("/", settingsRoutes);
app.route("/", accountRoutes);

app.notFound((c) => c.html(notFoundHtml({ user: c.get("user"), csrf: c.get("csrfToken") ?? "" }), 404));

app.onError((err, c) => {
  // Expected rejections (for example a form posted from another site) keep their own status.
  if (err instanceof HTTPException) {
    if (err.status === 403) return c.html(forbiddenHtml({ user: c.get("user"), csrf: c.get("csrfToken") ?? "" }), 403);
    return err.getResponse();
  }
  console.error(
    JSON.stringify({
      event: "unhandled_error",
      path: new URL(c.req.url).pathname,
      error: String(err),
      stack: err.stack,
    }),
  );
  return c.html(serverErrorHtml({ user: c.get("user"), csrf: c.get("csrfToken") ?? "" }), 500);
});

export default {
  fetch: app.fetch,
  // Runs once a day (see triggers in wrangler.jsonc). Only does anything in demo mode.
  scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Bindings>;
