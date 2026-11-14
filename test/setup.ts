import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Every test starts from an empty database (with a fresh settings row) and an empty photo bucket.
beforeEach(async () => {
  await env.DB.batch(
    [
      "lead_event",
      "lead_photo",
      "quote_item",
      "lead",
      "service",
      "session",
      "account",
      "verification",
      "user",
      "app_settings",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await env.DB.prepare("INSERT INTO app_settings (id) VALUES (1)").run();
  const listed = await env.PHOTOS.list();
  if (listed.objects.length) await env.PHOTOS.delete(listed.objects.map((o) => o.key));
});
