/* ------------------------------------------------------------------
   Audit log — shared types.

   Deliberately free of any database import: the Client Component needs
   these types, and importing them from `lib/audit.ts` would pull `mongodb`
   into the browser bundle. `lib/audit.ts` re-exports from here.
   ------------------------------------------------------------------ */

export type AuditSource = "quote" | "change" | "invoice";

/**
 * Outcome of the event, used for colour and grouping.
 * - `agree`     customer said yes
 * - `decline`   customer said no
 * - `moved`     the price changed
 * - `sent`      document went out
 * - `seen`      customer opened it (low signal on its own)
 * - `created`   document came into existence
 * - `other`     edits, exports, voids
 */
export type AuditTone =
  | "agree"
  | "decline"
  | "moved"
  | "sent"
  | "seen"
  | "created"
  | "other";

export type AuditEntry = {
  /** Stable id for React keys: source + reference + type + timestamp. */
  id: string;
  at: string;
  source: AuditSource;
  /** The document's own number, e.g. Q-2026-0002. */
  documentReference: string;
  jobReference: string;
  jobTitle: string;
  customer: string;
  label: string;
  detail: string;
  /**
   * What the underlying document was about (a change order's summary, a
   * quote's title). Searchable but not displayed — it lets "valve" find the
   * change order that added one.
   */
  subject: string;
  tone: AuditTone;
  /** Signed money movement, when the event moved the price. */
  amountCents?: number;
  currency: string;
  /** Raw event type from the source document, kept for filtering. */
  type: string;
};

export type AuditSummary = {
  total: number;
  agreed: number;
  declined: number;
  moved: number;
  /** Net signed money that moved because of approved change orders. */
  movedCents: number;
  /** Distinct jobs touched by the events in view. */
  jobs: number;
};

export type AuditQuery = {
  query?: string;
  source?: AuditSource | "all";
  tone?: AuditTone | "all";
  jobReference?: string;
  since?: string;
  limit?: number;
};

export const SOURCE_LABEL: Record<AuditSource, string> = {
  quote: "Quote",
  change: "Change order",
  invoice: "Invoice",
};

export const AUDIT_FILTERS: { id: AuditTone | "all"; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "agree", label: "Agreed" },
  { id: "decline", label: "Declined" },
  { id: "moved", label: "Price changes" },
  { id: "sent", label: "Sent" },
];
