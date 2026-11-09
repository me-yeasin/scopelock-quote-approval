import { ObjectId, type Collection, type Db } from "mongodb";

/* ------------------------------------------------------------------
   Quote domain — storage shapes, numbering, and mapping.

   Money is stored as integer minor units (pence/cents) plus an ISO 4217
   currency code on every document, never floats. That is the standard
   guidance for financial data in MongoDB and matches what the job
   documents already do.

   Quote numbers follow accounting convention: a continuous sequence
   per year with no gaps (HMRC and EU VAT rules require this for
   numbered documents), so they are issued from an atomic counter
   rather than derived from a random ObjectId suffix.
   ------------------------------------------------------------------ */

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired";

export const QUOTE_STATUSES: QuoteStatus[] = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
];

/** Stored line item — snapshotted so later catalogue edits cannot rewrite history. */
export type StoredLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type QuoteLink = {
  token: string;
  sentAt: string;
  sentTo: string;
  method: "email" | "sms" | "copy";
};

export type QuoteEvent = {
  type: "created" | "sent" | "viewed" | "approved" | "rejected";
  label: string;
  detail: string;
  at: string;
};

export type QuoteDoc = {
  _id: ObjectId;
  /** Gapless per-year number, e.g. Q-2026-0004. */
  reference: string;
  /** The job this quote belongs to, by job reference. */
  jobReference: string;
  jobId?: ObjectId;
  status: QuoteStatus;
  currency: string;
  title: string;
  customer: { name: string; email: string; phone: string };
  site: { city: string };
  lines: StoredLineItem[];
  subtotalCents: number;
  /** Approved change orders — kept out of the quote baseline on purpose. */
  approvedChangesCents: number;
  pendingChangesCents: number;
  notes: string;
  issuedAt: string;
  validUntil: string;
  link?: QuoteLink;
  decidedAt?: string;
  rejectionReason?: string;
  activity: QuoteEvent[];
  createdAt: string;
  updatedAt: string;
};

const COUNTERS = "counters";

/* ------------------------------------------------------------------
   Numbering
   ------------------------------------------------------------------ */

/**
 * Reserve the next quote number for a year.
 *
 * `findOneAndUpdate` with `$inc` and `upsert` is atomic, so two concurrent
 * job creations can never receive the same number. The counter is updated
 * *before* the quote is written: if the insert then fails, the number is
 * burned (a gap) rather than reused — reusing a number would be worse,
 * because two different documents would have carried the same reference.
 */
export async function nextQuoteReference(db: Db, now = new Date()): Promise<string> {
  const year = now.getFullYear();
  const counters = db.collection<{ _id: string; seq: number }>(COUNTERS);

  const result = await counters.findOneAndUpdate(
    { _id: `quote:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );

  const seq = result?.seq ?? 1;
  return `Q-${year}-${String(seq).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------
   Indexes
   ------------------------------------------------------------------ */

let indexesEnsured = false;

/** Create the quote indexes once per server process. */
export async function ensureQuoteIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;

  const quotes = db.collection<QuoteDoc>("quotes");
  await Promise.all([
    // References are the lookup key for every read and mutation.
    quotes.createIndex({ reference: 1 }, { unique: true }),
    // "Quotes for this job" — the query behind the job view.
    quotes.createIndex({ jobReference: 1, createdAt: -1 }),
    // The default list ordering and status filters.
    quotes.createIndex({ status: 1, createdAt: -1 }),
    // Approval-link lookups on the public route.
    quotes.createIndex({ "link.token": 1 }, { sparse: true }),
  ]);

  const jobs = db.collection("jobs");
  await jobs.createIndex({ reference: 1 }, { unique: true });

  indexesEnsured = true;
}

/* ------------------------------------------------------------------
   Helpers shared with the job flow
   ------------------------------------------------------------------ */

export function lineTotalCents(item: { quantity: number; unitPriceCents: number }) {
  return Math.round(item.quantity * item.unitPriceCents);
}

export function sumLines(lines: StoredLineItem[]) {
  return lines.reduce((sum, line) => sum + line.totalCents, 0);
}

export function buildLines(
  raw: { description: string; quantity: number; unitPriceCents: number }[],
): StoredLineItem[] {
  return raw.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    totalCents: lineTotalCents(item),
  }));
}

/** Opaque, unguessable token for the customer-facing approval link. */
export function newLinkToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeEvent(
  type: QuoteEvent["type"],
  label: string,
  detail: string,
  at = new Date().toISOString(),
): QuoteEvent {
  return { type, label, detail, at };
}

export function quotesCollection(db: Db): Collection<QuoteDoc> {
  return db.collection<QuoteDoc>("quotes");
}
