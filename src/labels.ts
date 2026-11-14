/**
 * Every role, status and caption shown in the app lives here, so you can rename them in one place.
 * The keys on the left are stored in the database and must not change. Edit only the text on the right.
 */

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const LEAD_STATUSES = ["new", "needs_info", "quoted", "accepted", "booked", "done", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses still being worked on. Done and lost leads are closed. */
export const OPEN_STATUSES: readonly LeadStatus[] = ["new", "needs_info", "quoted", "accepted", "booked"];

export const LEAD_SOURCES = ["form", "phone", "email", "walk_in", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const URGENCIES = ["flexible", "soon", "urgent"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const roleLabel: Record<Role, string> = {
  admin: "Owner or admin",
  staff: "Staff",
};

/** Shown for a signed-up user who has not been given a role yet. */
export const PENDING_LABEL = "Waiting for approval";

export const statusLabel: Record<LeadStatus, string> = {
  new: "New",
  needs_info: "Needs info",
  quoted: "Quote sent",
  accepted: "Accepted",
  booked: "Booked",
  done: "Done",
  lost: "Lost",
};

/** One line under each status on the inbox, saying what to do next. */
export const statusHelp: Record<LeadStatus, string> = {
  new: "Reply or send a quote.",
  needs_info: "Waiting on details from the customer.",
  quoted: "Waiting for the customer to accept.",
  accepted: "Accepted. Book a time.",
  booked: "Booked in. Mark done when finished.",
  done: "Finished.",
  lost: "Closed without the job.",
};

export const sourceLabel: Record<LeadSource, string> = {
  form: "Enquiry form",
  phone: "Phone call",
  email: "Email",
  walk_in: "In person",
  other: "Other",
};

export const urgencyLabel: Record<Urgency, string> = {
  flexible: "Flexible",
  soon: "This week",
  urgent: "Urgent",
};

/** Customer-facing wording for urgency on the enquiry form. */
export const urgencyQuestion: Record<Urgency, string> = {
  flexible: "No rush, any time in the next few weeks",
  soon: "Soon, ideally this week",
  urgent: "Urgent, as soon as possible",
};

/** Reasons offered when a lead is marked lost. Any text can be typed instead. */
export const LOST_REASONS = [
  "Price too high",
  "Went with someone else",
  "No reply from customer",
  "Outside our area",
  "Not a job we do",
  "Spam or test",
];

export const words = {
  appName: "CatchDesk",
};

/** Currencies offered on the Settings page. */
export const CURRENCIES = ["USD", "AUD", "NZD", "CAD", "GBP", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Ready-made service lists offered on the Settings page, to get a new business started quickly.
 * Each service is [name, usual price in cents]. 0 means price on inspection.
 */
export const SERVICE_TEMPLATES: Record<string, { name: string; services: [string, number][] }> = {
  home: {
    name: "Home services (repairs, handyman, cleaning)",
    services: [
      ["General repair or handyman visit", 0],
      ["Fixture install (lights, fans, shelves)", 0],
      ["End of lease or deep clean", 0],
      ["Gutter clean", 0],
    ],
  },
  trades: {
    name: "Trades (plumbing, electrical, heating and cooling)",
    services: [
      ["Leak or blocked drain", 0],
      ["Hot water system", 0],
      ["Power point or lighting", 0],
      ["Heating or cooling service", 0],
    ],
  },
  outdoor: {
    name: "Outdoor (landscaping, lawns, pools)",
    services: [
      ["Lawn mowing and edging", 0],
      ["Garden tidy and green waste", 0],
      ["Tree or hedge trimming", 0],
      ["Pool clean and chemical balance", 0],
    ],
  },
  studio: {
    name: "Studios and professional services",
    services: [
      ["Discovery call", 0],
      ["Small project", 0],
      ["Monthly retainer", 0],
    ],
  },
};
