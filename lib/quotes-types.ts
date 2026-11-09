/* ------------------------------------------------------------------
   Quotes — view models and sample content for the UI layer.

   These types describe what the quote screen *renders*. They are
   intentionally independent of MongoDB so the UI can be built and
   reviewed before the persistence layer is wired up (next step).
   ------------------------------------------------------------------ */

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

export const QUOTE_FILTERS: { id: QuoteStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sent", label: "Awaiting" },
  { id: "approved", label: "Approved" },
  { id: "draft", label: "Drafts" },
  { id: "rejected", label: "Rejected" },
  { id: "expired", label: "Expired" },
];

export type QuoteLine = {
  id: string;
  description: string;
  quantity: number;
  /** Minor units (pence/cents) so totals never drift. */
  unitPriceCents: number;
};

export type Quote = {
  /** Human reference, e.g. Q-2026-0114. */
  id: string;
  jobReference: string;
  title: string;
  customer: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  currency: "GBP" | "EUR";
  status: QuoteStatus;
  lines: QuoteLine[];
  /** Approved change orders rolled into the job — not part of the quote. */
  approvedChangesCents: number;
  pendingChangesCents: number;
  notes: string;
  issuedAt: string;
  /** ISO validity date for the quote. */
  validUntil: string;
  /** Approval link metadata — present once the quote has been sent. */
  link?: {
    url: string;
    sentAt: string;
    sentTo: string;
    method: "email" | "sms" | "copy";
  };
  decidedAt?: string;
  rejectionReason?: string;
  activity: { id: string; label: string; detail: string; at: string }[];
};

/* ------------------------------------------------------------------
   Formatting helpers
   ------------------------------------------------------------------ */

const SYMBOL: Record<Quote["currency"], string> = { GBP: "£", EUR: "€" };

export function money(cents: number, currency: Quote["currency"]) {
  const value = (Number(cents) || 0) / 100;
  const text = value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${SYMBOL[currency]}${text}`;
}

export function lineTotal(line: QuoteLine) {
  return Math.round(line.quantity * line.unitPriceCents);
}

export function quoteSubtotal(quote: Quote) {
  return quote.lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/** The baseline locked when the quote is approved. */
export function quoteTotal(quote: Quote) {
  return quoteSubtotal(quote);
}

/** What the customer would owe today if pending changes were approved. */
export function quoteProjected(quote: Quote) {
  return quoteTotal(quote) + quote.approvedChangesCents + quote.pendingChangesCents;
}

/**
 * Now-relative helpers take the current time as an argument instead of
 * calling `Date.now()` themselves. Next.js 16 rejects uncached `Date.now()`
 * during prerender of a Client Component, so callers pass a value that is
 * only available after mount (see `useNow`).
 */
export function daysUntil(iso: string, now: number) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - now) / 86_400_000);
}

export function expiryNote(quote: Quote, now: number | null) {
  if (quote.status === "approved" || quote.status === "rejected") return null;
  if (now === null) return null;
  const days = daysUntil(quote.validUntil, now);
  if (days === null) return null;
  if (days < 0) return { tone: "danger" as const, text: `Expired ${Math.abs(days)} days ago` };
  if (days === 0) return { tone: "warn" as const, text: "Expires today" };
  if (days <= 7) return { tone: "warn" as const, text: `Expires in ${days} days` };
  return { tone: "calm" as const, text: `Valid for ${days} days` };
}

/* ------------------------------------------------------------------
   Sample quotes — realistic trades content for design review.
   Dates are fixed ISO strings (not derived from the clock) so the
   prerendered HTML is deterministic and the page can be static.
   ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/** Anchor for sample dates — keeps fixtures stable across builds. */
const BASE = new Date("2026-11-07T09:00:00.000Z").getTime();

const daysFrom = (days: number) => new Date(BASE + days * DAY_MS).toISOString();

export const SAMPLE_QUOTES: Quote[] = [
  {
    id: "Q-2026-0114",
    jobReference: "J-2026-048",
    title: "Bathroom renovation",
    customer: "M. Harris",
    customerEmail: "m.harris@example.com",
    customerPhone: "+44 7700 900112",
    city: "London",
    currency: "GBP",
    status: "sent",
    issuedAt: daysFrom(-2),
    validUntil: daysFrom(12),
    lines: [
      { id: "l1", description: "Strip out existing suite and dispose", quantity: 1, unitPriceCents: 48000 },
      { id: "l2", description: "First-fix pipework and waste runs", quantity: 1, unitPriceCents: 62000 },
      { id: "l3", description: "Supply and fit vanity unit", quantity: 1, unitPriceCents: 34500 },
      { id: "l4", description: "Ceramic wall tiling", quantity: 18, unitPriceCents: 4200 },
    ],
    approvedChangesCents: 0,
    pendingChangesCents: 0,
    notes:
      "Price assumes clear access and existing stopcock in working order. Any asbestos found is excluded and quoted separately.",
    link: {
      url: "https://scopelock.app/q/8f2c1a",
      sentAt: daysFrom(-2),
      sentTo: "m.harris@example.com",
      method: "email",
    },
    activity: [
      { id: "a1", label: "Sent for approval", detail: "Emailed to m.harris@example.com", at: daysFrom(-2) },
      { id: "a2", label: "Link opened", detail: "Customer viewed the quote on mobile", at: daysFrom(-1) },
      { id: "a3", label: "Quote created", detail: "Built from job J-2026-048", at: daysFrom(-3) },
    ],
  },
  {
    id: "Q-2026-0113",
    jobReference: "J-2026-047",
    title: "Kitchen rewire",
    customer: "T. Okafor",
    customerEmail: "t.okafor@example.com",
    customerPhone: "+44 7700 900233",
    city: "Manchester",
    currency: "GBP",
    status: "approved",
    issuedAt: daysFrom(-9),
    validUntil: daysFrom(-2),
    decidedAt: daysFrom(-7),
    lines: [
      { id: "l1", description: "Consumer unit upgrade to 18th edition", quantity: 1, unitPriceCents: 78000 },
      { id: "l2", description: "Kitchen ring main and appliance spurs", quantity: 1, unitPriceCents: 96000 },
      { id: "l3", description: "Downlight installation and testing", quantity: 12, unitPriceCents: 6500 },
    ],
    approvedChangesCents: 24500,
    pendingChangesCents: 0,
    notes: "Includes EICR certificate and Building Control notification.",
    link: {
      url: "https://scopelock.app/q/4b91de",
      sentAt: daysFrom(-9),
      sentTo: "+44 7700 900233",
      method: "sms",
    },
    activity: [
      { id: "a1", label: "Approved by customer", detail: "Approved on their phone", at: daysFrom(-7) },
      { id: "a2", label: "Link opened", detail: "Customer viewed the quote", at: daysFrom(-8) },
      { id: "a3", label: "Sent for approval", detail: "Sent by SMS to +44 7700 900233", at: daysFrom(-9) },
    ],
  },
  {
    id: "Q-2026-0112",
    jobReference: "J-2026-046",
    title: "Boiler replacement",
    customer: "S. Whitfield",
    customerEmail: "s.whitfield@example.com",
    customerPhone: "+44 7700 900344",
    city: "Bristol",
    currency: "GBP",
    status: "draft",
    issuedAt: daysFrom(-1),
    validUntil: daysFrom(20),
    lines: [
      { id: "l1", description: "Supply Worcester Bosch 8000 30kW combi", quantity: 1, unitPriceCents: 189000 },
      { id: "l2", description: "Remove and dispose of old boiler", quantity: 1, unitPriceCents: 22000 },
      { id: "l3", description: "Flue run and gas safety check", quantity: 1, unitPriceCents: 31000 },
    ],
    approvedChangesCents: 0,
    pendingChangesCents: 0,
    notes: "Customer to clear loft access before the fit date.",
    activity: [
      { id: "a1", label: "Draft saved", detail: "Line items still being priced", at: daysFrom(-1) },
    ],
  },
  {
    id: "Q-2026-0111",
    jobReference: "J-2026-045",
    title: "Garden room electrics",
    customer: "A. Delgado",
    customerEmail: "a.delgado@example.com",
    customerPhone: "+44 7700 900455",
    city: "Leeds",
    currency: "GBP",
    status: "sent",
    issuedAt: daysFrom(-5),
    validUntil: daysFrom(3),
    lines: [
      { id: "l1", description: "SWA armoured cable run to outbuilding", quantity: 32, unitPriceCents: 1850 },
      { id: "l2", description: "Garage consumer unit and RCD protection", quantity: 1, unitPriceCents: 42000 },
      { id: "l3", description: "Sockets and LED lighting circuit", quantity: 1, unitPriceCents: 56000 },
    ],
    approvedChangesCents: 0,
    pendingChangesCents: 0,
    notes: "Trench to be dug by customer. Cable route to be agreed on site.",
    link: {
      url: "https://scopelock.app/q/7d10ab",
      sentAt: daysFrom(-5),
      sentTo: "a.delgado@example.com",
      method: "email",
    },
    activity: [
      { id: "a1", label: "Sent for approval", detail: "Emailed to a.delgado@example.com", at: daysFrom(-5) },
      { id: "a2", label: "Reminder sent", detail: "Quote expires in 3 days", at: daysFrom(-1) },
    ],
  },
  {
    id: "Q-2026-0110",
    jobReference: "J-2026-044",
    title: "Loft conversion plumbing",
    customer: "R. Mensah",
    customerEmail: "r.mensah@example.com",
    customerPhone: "+44 7700 900566",
    city: "Birmingham",
    currency: "EUR",
    status: "rejected",
    issuedAt: daysFrom(-14),
    validUntil: daysFrom(-4),
    decidedAt: daysFrom(-11),
    rejectionReason: "Customer chose to postpone until next spring.",
    lines: [
      { id: "l1", description: "Soil stack alteration", quantity: 1, unitPriceCents: 68000 },
      { id: "l2", description: "En-suite first fix", quantity: 1, unitPriceCents: 112000 },
      { id: "l3", description: "Pump and macerator install", quantity: 1, unitPriceCents: 39000 },
    ],
    approvedChangesCents: 0,
    pendingChangesCents: 0,
    notes: "Assumes existing joist direction supports the new waste run.",
    link: {
      url: "https://scopelock.app/q/2ea774",
      sentAt: daysFrom(-14),
      sentTo: "r.mensah@example.com",
      method: "email",
    },
    activity: [
      { id: "a1", label: "Rejected by customer", detail: "Postponed to next spring", at: daysFrom(-11) },
      { id: "a2", label: "Link opened", detail: "Customer viewed the quote twice", at: daysFrom(-12) },
      { id: "a3", label: "Sent for approval", detail: "Emailed to r.mensah@example.com", at: daysFrom(-14) },
    ],
  },
];
