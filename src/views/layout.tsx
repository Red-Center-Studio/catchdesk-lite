import type { Child, FC } from "hono/jsx";
import { raw } from "hono/html";
import type { AppUser } from "../env";
import { can } from "../lib/can";
import { CSRF_FIELD } from "../lib/csrf-field";
import { roleLabel, words } from "../labels";

export type NavKey = "today" | "leads" | "new" | "settings" | "account";

interface NavLink {
  key: NavKey;
  href: string;
  label: string;
  show: (u: AppUser) => boolean;
}

const NAV: NavLink[] = [
  { key: "today", href: "/today", label: "Today", show: (u) => can(u, "lead:view") },
  { key: "leads", href: "/leads", label: "Leads", show: (u) => can(u, "lead:view") },
  { key: "new", href: "/leads/new", label: "Add lead", show: (u) => can(u, "lead:work") },
  { key: "settings", href: "/settings", label: "Settings", show: (u) => can(u, "settings:edit") },
  { key: "account", href: "/account", label: "Account", show: (u) => can(u, "lead:view") },
];

export interface PageProps {
  title: string;
  user?: AppUser | null;
  active?: NavKey;
  businessName?: string;
  csrf: string;
  demo?: boolean;
  /** Public pages (enquiry form, customer quote) show the business name only, with no staff menu. */
  publicPage?: boolean;
  description?: string;
  children?: Child;
}

export const Page: FC<PageProps> = ({
  title,
  user,
  active,
  businessName,
  csrf,
  demo,
  publicPage,
  description,
  children,
}) => (
  <>
    {raw("<!doctype html>")}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0b2a26" />
        {publicPage ? null : <meta name="robots" content="noindex" />}
        {description ? <meta name="description" content={description} /> : null}
        <title>{`${title} | ${businessName ?? words.appName}`}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/styles.css" />
        <script src="/app.js" defer></script>
      </head>
      <body class="min-h-dvh bg-canvas text-ink antialiased">
        <a
          href="#main"
          class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {demo ? (
          <div class="bg-accent px-4 py-2 text-center text-sm font-medium text-navy print:hidden">
            CatchDesk demo. No emails are sent, and everything resets every night.
          </div>
        ) : null}
        {publicPage ? (
          <PublicHeader businessName={businessName} />
        ) : (
          <Header user={user ?? null} active={active} businessName={businessName} csrf={csrf} />
        )}
        <div id="net-error" class="mx-auto hidden max-w-3xl px-4 pt-4" role="alert"></div>
        <main id="main" class="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:pt-6">
          {children}
        </main>
        {publicPage ? (
          <footer class="mx-auto max-w-3xl px-4 pb-8 text-center text-sm text-gray-700">
            <a class="inline-flex min-h-11 min-w-11 items-center justify-center px-2 underline" href="/privacy">
              Privacy
            </a>
            {" · "}
            <a class="inline-flex min-h-11 min-w-11 items-center justify-center px-2 underline" href="/terms">
              Terms
            </a>
          </footer>
        ) : null}
      </body>
    </html>
  </>
);

const PublicHeader: FC<{ businessName?: string | undefined }> = ({ businessName }) => (
  <header class="bg-navy text-white print:bg-white print:text-ink">
    <div class="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
      <p class="truncate text-lg font-semibold">{businessName ?? words.appName}</p>
    </div>
  </header>
);

const Header: FC<{
  user: AppUser | null;
  active?: NavKey | undefined;
  businessName?: string | undefined;
  csrf: string;
}> = ({ user, active, businessName, csrf }) => {
  const links = user && user.role ? NAV.filter((l) => l.show(user)) : [];
  return (
    <header class="sticky top-0 z-40 bg-navy text-white shadow-md print:hidden">
      <div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <a href="/" class="flex min-h-11 min-w-0 items-center gap-2 font-semibold text-white">
          <Logo />
          <span class="truncate">{businessName ?? words.appName}</span>
        </a>
        {user ? (
          <form method="post" action="/logout" class="shrink-0">
            <input type="hidden" name={CSRF_FIELD} value={csrf} />
            <button
              type="submit"
              class="min-h-11 rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </form>
        ) : null}
      </div>
      {links.length > 0 ? (
        <nav aria-label="Main" class="mx-auto max-w-3xl px-2">
          <ul class="grid auto-cols-fr grid-flow-col gap-0.5 pb-2 sm:flex sm:gap-1">
            {links.map((l) => (
              <li>
                <a
                  href={l.href}
                  aria-current={active === l.key ? "page" : undefined}
                  class={
                    active === l.key
                      ? "flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border-b-2 border-accent bg-white/15 px-1 py-2.5 text-center text-[13px] font-semibold text-white sm:px-3 sm:text-sm"
                      : "flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border-b-2 border-transparent px-1 py-2.5 text-center text-[13px] text-navy-200 hover:bg-white/10 hover:text-white sm:px-3 sm:text-sm"
                  }
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {user && user.role ? (
        <p class="sr-only">
          Signed in as {user.name}, {roleLabel[user.role]}
        </p>
      ) : null}
    </header>
  );
};

export const Logo: FC = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" class="shrink-0">
    <rect width="32" height="32" rx="8" fill="#f2a516" />
    <path d="M8 11h16v9a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="none" stroke="#0b2a26" stroke-width="3" />
    <path
      d="M12 15.5l3 3 5-5.5"
      fill="none"
      stroke="#0b2a26"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);
