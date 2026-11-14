import type { Role } from "../labels";

/**
 * Every permission rule in one place. Routes call `can()` on the server before doing anything, so hiding a
 * button is never the only protection. A user with no role (waiting for approval) can do nothing.
 *
 * | Action          | Staff | Admin |
 * | --------------- | ----- | ----- |
 * | lead:view       | yes   | yes   |
 * | lead:work       | yes   | yes   |  (reply, quote, book, change status)
 * | lead:delete     | no    | yes   |
 * | settings:edit   | no    | yes   |  (business, prices and tax, services, enquiry form)
 * | team:manage     | no    | yes   |
 */

export type Action = "lead:view" | "lead:work" | "lead:delete" | "settings:edit" | "team:manage";

export interface Actor {
  id: string;
  role: Role | null;
}

const EVERYONE: readonly Role[] = ["admin", "staff"];
const ADMIN: readonly Role[] = ["admin"];

const allowed: Record<Action, readonly Role[]> = {
  "lead:view": EVERYONE,
  "lead:work": EVERYONE,
  "lead:delete": ADMIN,
  "settings:edit": ADMIN,
  "team:manage": ADMIN,
};

export function can(actor: Actor | null | undefined, action: Action): boolean {
  if (!actor || !actor.role) return false;
  if (!EVERYONE.includes(actor.role)) return false;
  return allowed[action].includes(actor.role);
}

export const ALL_ACTIONS = Object.keys(allowed) as Action[];
