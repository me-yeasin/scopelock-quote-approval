/* ------------------------------------------------------------------
   Quotes — view models for the UI layer.

   These types describe exactly what the screens render. The server
   actions in `app/quotes/actions.ts` map stored documents onto them, so
   the client never handles raw Mongo documents or re-implements money
   and date formatting.
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
  /** Minor units (pence/cents) — matches how money is stored. */
  unitPriceCents: number;
};

export type Quote = {
  /** Gapless per-year number, e.g. Q-2026-0004. */
  id: string;
  jobReference: string;
  title: string;
  customer: string;
  customerInitials: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  currency: "GBP" | "EUR";
  status: QuoteStatus;
  lines: QuoteLine[];
  /** Approved change orders, rolled into the job but never into the quote. */
  approvedChangesCents: number;
  /** Pending changes — shown, but excluded from anything billable. */
  pendingChangesCents: number;
  notes: string;
  issuedAt: string;
  validUntil: string;
  link?: {
    /** App-relative approval path, e.g. /q/<token>. */
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
   Formatting helpers (pure — safe on server and client)
   ------------------------------------------------------------------ */

const SYMBOL: Record<Quote["currency"], string> = { GBP: "£", EUR: "€" };

/**
 * Format integer minor units as money.
 *
 * GBP and EUR have hand-picked symbols for the tightest typography in
 * tables. Anything else falls back to the platform's formatter, so an
 * invoice in an unexpected currency still renders sensibly instead of
 * printing "undefined".
 */
export function money(cents: number, currency: Quote["currency"] | string) {
  const value = (Number(cents) || 0) / 100;
  const text = value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const symbol = SYMBOL[currency as Quote["currency"]];
  if (symbol) return `${symbol}${text}`;

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
    }).format(value);
  } catch {
    return `${text} ${currency}`.trim();
  }
}

export function lineTotal(line: QuoteLine) {
  return Math.round(line.quantity * line.unitPriceCents);
}

export function quoteSubtotal(quote: Quote) {
  return quote.lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/** The locked baseline agreed with the customer, before any changes. */
export function quoteTotal(quote: Quote) {
  return quoteSubtotal(quote);
}

/**
 * What the customer actually owes: the baseline plus every approved
 * change order.
 *
 * `quoteTotal` is only the agreed baseline — the quote document is frozen
 * on approval, so approved changes are stored beside it and never folded
 * into the line items. Anything presented as a final, billable figure must
 * use this function, not `quoteTotal`.
 */
export function quoteBillable(quote: Quote) {
  return quoteTotal(quote) + quote.approvedChangesCents;
}

/** What the job would total if every pending change were approved. */
export function quoteProjected(quote: Quote) {
  return quoteBillable(quote) + quote.pendingChangesCents;
}

/* ------------------------------------------------------------------
   Now-relative helpers take the current time as an argument instead of
   calling `Date.now()` themselves. Next.js 16 rejects uncached
   `Date.now()` during prerender of a Client Component, so callers pass a
   value that only exists after mount (see `useNow`).
   ------------------------------------------------------------------ */

export function daysUntil(iso: string, now: number) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - now) / 86_400_000);
}

export function expiryNote(quote: Quote, now: number | null) {
  if (quote.status === "approved" || quote.status === "rejected") return null;
  if (quote.status === "expired") return { tone: "danger" as const, text: "Expired" };
  if (now === null) return null;

  const days = daysUntil(quote.validUntil, now);
  if (days === null) return null;
  if (days < 0) return { tone: "danger" as const, text: `Expired ${Math.abs(days)} days ago` };
  if (days === 0) return { tone: "warn" as const, text: "Expires today" };
  if (days <= 7) return { tone: "warn" as const, text: `Expires in ${days} days` };
  return { tone: "calm" as const, text: `Valid for ${days} days` };
}
