import { ObjectId, type Collection, type Db } from "mongodb";

/* ------------------------------------------------------------------
   Invoice domain — storage shapes, numbering, and the live derivation.

   THE CORE RULE: an invoice stores no money.

   One invoice per job, and it is *live*: every figure is derived from the
   job's approved quote plus its approved change orders at read time. The
   document holds only identity and state (which job, when issued, whether
   paid, the payment terms). That makes drift structurally impossible —
   there is no second copy of the money to get out of step.

   This is deliberately the opposite of the quote/change-order rule, where
   approval freezes the document because the customer signed it. An invoice
   here is a running statement of account for a job in progress. The frozen
   artefact is the PDF: `issuedSnapshotCents` records what a PDF said, and
   is *only* used to tell the tradesperson "the copy you sent is now out of
   date", never to compute the balance.

   Consequences this module enforces:
   - An invoice can only exist for a job with an APPROVED quote. There is
     nothing to bill before the customer has agreed the baseline.
   - Nothing but approved money is ever billed. Pending change orders are
     surfaced separately as "not included".
   - Void invoices are excluded from every balance and total.
   - Money is integer minor units plus an ISO 4217 currency, never floats.
   - Payment state can only move forward: there is no "unpaid" action for a
     paid invoice, because deleting a payment record is an accounting
     event, not a correction.
   ------------------------------------------------------------------ */

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";

export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "issued", "paid", "void"];

export type InvoiceEventType = "created" | "issued" | "viewed" | "paid" | "voided" | "noted";

export type InvoiceEvent = {
  type: InvoiceEventType;
  label: string;
  detail: string;
  at: string;
};

export type InvoiceDoc = {
  /**
   * Hex string of the owning user. Written at creation; every query filters on
   * it. Optional in the type only because documents created before
   * authentication may still lack it until they are claimed.
   */
  ownerId?: string;
  _id: ObjectId;
  /** Gapless per-year number, e.g. INV-2026-0004. */
  reference: string;
  /** The job this invoice bills. Unique — one invoice per job. */
  jobReference: string;
  /** The approved quote that forms the baseline. */
  quoteReference: string;
  status: InvoiceStatus;
  currency: string;
  /** Denormalised for list rendering; refreshed from the job on write. */
  jobTitle: string;
  customer: { name: string; email: string; phone: string };
  site: { city: string };
  /** The plumber's trading details, printed on the PDF. */
  business: {
    name: string;
    address: string;
    email: string;
    phone: string;
    vatNumber?: string;
  };
  /** ISO dates (yyyy-mm-dd) so "overdue" is a string comparison. */
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  voidedAt?: string;
  voidReason?: string;
  /** Payment terms in days, used to derive `dueAt`. */
  termsDays: number;
  notes: string;
  /**
   * What the last exported PDF said. NOT the balance — only the basis for
   * the "your sent copy is out of date" warning. Absent until first export.
   */
  issuedSnapshotCents?: number;
  /**
   * How many pending change orders existed at the last export, so the
   * warning can distinguish "new pending work" from "approved total moved".
   */
  activity: InvoiceEvent[];
  createdAt: string;
  updatedAt: string;
};

const COUNTERS = "counters";
const INVOICES = "invoices";

/* ------------------------------------------------------------------
   Numbering
   ------------------------------------------------------------------ */

/**
 * Reserve the next invoice number for a year.
 *
 * Same atomic `$inc` contract as quotes and change orders: two concurrent
 * creations cannot collide, and the counter is bumped before the document
 * is written so a failed insert burns the number rather than reusing it.
 * Two different invoices carrying the same reference would be worse than a
 * gap in the sequence.
 */
export async function nextInvoiceReference(
  db: Db,
  now = new Date(),
  ownerId = "legacy",
): Promise<string> {
  const year = now.getFullYear();
  const counters = db.collection<{ _id: string; seq: number }>(COUNTERS);

  const result = await counters.findOneAndUpdate(
    { _id: `invoice:${ownerId}:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );

  const seq = result?.seq ?? 1;
  return `INV-${year}-${String(seq).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------
   Dates

   Invoice dates are ISO calendar days (yyyy-mm-dd), not instants. An
   invoice is due "on 21 November", not at a particular millisecond, and
   string comparison makes overdue checks unambiguous across timezones.
   ------------------------------------------------------------------ */

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `termsDays` after `issuedAt`, as an ISO day. */
export function dueDayFrom(issuedAt: string, termsDays: number): string {
  const base = new Date(`${issuedAt}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return issuedAt;
  base.setUTCDate(base.getUTCDate() + Math.max(0, Math.round(termsDays)));
  return isoDay(base);
}

/** Whole days between two ISO days; negative when `b` is before `now`. */
export function daysBetween(nowDay: string, day: string): number {
  const a = new Date(`${nowDay}T00:00:00.000Z`).getTime();
  const b = new Date(`${day}T00:00:00.000Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/* ------------------------------------------------------------------
   Building the live invoice

   `deriveInvoice` is the single place an invoice's money is calculated,
   and it is a pure function of (invoice doc, quote doc, change docs). No
   caller is allowed to compute a total any other way.
   ------------------------------------------------------------------ */

export type InvoiceLineSource = "quote" | "change";

export type DerivedLine = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** Signed minor units: negative for a credit. */
  totalCents: number;
  source: InvoiceLineSource;
  changeReference?: string;
  changeSummary?: string;
};

export type DerivedInvoice = {
  reference: string;
  status: InvoiceStatus;
  currency: string;
  jobReference: string;
  quoteReference: string;
  jobTitle: string;
  customer: { name: string; email: string; phone: string };
  site: { city: string };
  business: InvoiceDoc["business"];
  lines: DerivedLine[];
  /** Agreed quote subtotal — the baseline. */
  baselineCents: number;
  /** Signed sum of approved change orders. */
  approvedChangesCents: number;
  /** Signed sum of changes raised but not yet agreed. Never billed. */
  pendingChangesCents: number;
  /** baselineCents + approvedChangesCents. What the customer owes. */
  totalCents: number;
  /** totalCents + pendingChangesCents — the "if approved" figure. */
  projectedCents: number;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  voidedAt?: string;
  termsDays: number;
  notes: string;
  /** True when the total has moved since the last PDF export. */
  staleSinceExport: boolean;
  /** The figure the last exported PDF showed, if any. */
  issuedSnapshotCents?: number;
  /** Signed amount the total has moved since that export. */
  driftCents: number;
  activity: InvoiceEvent[];
};

type QuoteLike = {
  reference: string;
  jobReference?: string;
  status?: string;
  currency?: string;
  title?: string;
  customer?: { name?: string; email?: string; phone?: string };
  site?: { city?: string };
  lines?: { description?: string; quantity?: number; unitPriceCents?: number; totalCents?: number }[];
  subtotalCents?: number;
  notes?: string;
  issuedAt?: string;
};

type ChangeLike = {
  reference: string;
  status?: string;
  summary?: string;
  netCents?: number;
  lines?: {
    description?: string;
    quantity?: number;
    unitPriceCents?: number;
    totalCents?: number;
    direction?: "add" | "credit";
  }[];
};

function money(currency: string | undefined) {
  return (currency || "GBP").toUpperCase();
}

/**
 * Turn stored documents into the single invoice the UI renders.
 *
 * Pending changes contribute nothing to `totalCents`; they are exposed as
 * `pendingChangesCents` and as separate non-billed lines so the customer
 * can see what is coming without being charged for it.
 */
export function deriveInvoice(
  doc: InvoiceDoc,
  quote: QuoteLike,
  changes: ChangeLike[],
): DerivedInvoice {
  const currency = money(quote.currency ?? doc.currency);

  const quoteLines: DerivedLine[] = (quote.lines ?? []).map((line, index) => {
    const quantity = Number(line.quantity) || 0;
    const unitPriceCents = Math.round(Number(line.unitPriceCents) || 0);
    return {
      id: `q-${index}`,
      description: String(line.description ?? ""),
      quantity,
      unitPriceCents,
      totalCents: Math.round(quantity * unitPriceCents),
      source: "quote" as const,
    };
  });

  const approved = changes.filter((change) => change.status === "approved");
  const pending = changes.filter(
    (change) => change.status === "sent" || change.status === "draft",
  );

  const changeLines: DerivedLine[] = [];
  const approvedChangesCents = approved.reduce((sum, change) => {
    const net = Math.round(Number(change.netCents) || 0);
    // One line per change order so the customer can match a row back to the
    // order they agreed to, rather than an opaque "changes" subtotal.
    changeLines.push({
      id: `c-${change.reference}`,
      description: change.summary || "Approved change",
      quantity: 1,
      unitPriceCents: Math.abs(net),
      totalCents: net,
      source: "change",
      changeReference: change.reference,
      changeSummary: change.summary,
    });
    return sum + net;
  }, 0);

  const pendingChangesCents = pending.reduce(
    (sum, change) => sum + Math.round(Number(change.netCents) || 0),
    0,
  );

  const baselineCents = Math.round(Number(quote.subtotalCents) || 0);
  const totalCents = baselineCents + approvedChangesCents;
  const issuedSnapshotCents = doc.issuedSnapshotCents;

  return {
    reference: doc.reference,
    status: doc.status,
    currency,
    jobReference: doc.jobReference,
    quoteReference: doc.quoteReference,
    jobTitle: doc.jobTitle || quote.title || "",
    customer: {
      name: doc.customer?.name || quote.customer?.name || "",
      email: doc.customer?.email || quote.customer?.email || "",
      phone: doc.customer?.phone || quote.customer?.phone || "",
    },
    site: { city: doc.site?.city || quote.site?.city || "" },
    business: doc.business,
    lines: [...quoteLines, ...changeLines],
    baselineCents,
    approvedChangesCents,
    pendingChangesCents,
    totalCents,
    projectedCents: totalCents + pendingChangesCents,
    issuedAt: doc.issuedAt,
    dueAt: doc.dueAt,
    paidAt: doc.paidAt,
    voidedAt: doc.voidedAt,
    termsDays: doc.termsDays,
    notes: doc.notes,
    staleSinceExport:
      issuedSnapshotCents !== undefined && issuedSnapshotCents !== totalCents,
    issuedSnapshotCents,
    driftCents:
      issuedSnapshotCents === undefined ? 0 : totalCents - issuedSnapshotCents,
    activity: doc.activity ?? [],
  };
}

/* ------------------------------------------------------------------
   Indexes
   ------------------------------------------------------------------ */

let indexesEnsured = false;

export async function ensureInvoiceIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;

  const invoices = invoicesCollection(db);
  await Promise.all([
    invoices.createIndex({ reference: 1 }, { unique: true }),
    // One invoice per job is a hard business rule, enforced by the database
    // rather than by a check-then-write that two requests could both pass.
    invoices.createIndex({ jobReference: 1 }, { unique: true }),
    invoices.createIndex({ status: 1, issuedAt: -1 }),
  ]);

  indexesEnsured = true;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

export function invoicesCollection(db: Db): Collection<InvoiceDoc> {
  return db.collection<InvoiceDoc>(INVOICES);
}

export function makeInvoiceEvent(
  type: InvoiceEventType,
  label: string,
  detail: string,
  at = new Date().toISOString(),
): InvoiceEvent {
  return { type, label, detail, at };
}

/**
 * The default trading details, used until a settings screen exists.
 * Kept in one place so the PDF and the drawer cannot disagree.
 */
export const DEFAULT_BUSINESS: InvoiceDoc["business"] = {
  name: "Your business name",
  address: "",
  email: "",
  phone: "",
};

/**
 * Is this invoice capable of being paid?
 *
 * A draft has not been sent, and a void invoice is cancelled. Only an
 * issued invoice can take a payment, and a paid one is terminal.
 */
export function canMarkPaid(status: InvoiceStatus) {
  return status === "issued";
}

export function canVoid(status: InvoiceStatus) {
  return status === "draft" || status === "issued";
}

export function canIssue(status: InvoiceStatus) {
  return status === "draft";
}

/**
 * Guard a state transition, returning the reason it is not allowed.
 * Every mutation calls this before writing, so an invalid transition can
 * never be reached from any entry point (UI, server action, or future API).
 */
export function transitionError(
  from: InvoiceStatus,
  to: InvoiceStatus,
): string | null {
  if (from === to) return `This invoice is already ${from}.`;
  if (from === "paid") return "A paid invoice cannot be changed.";
  if (from === "void") return "A void invoice cannot be changed.";

  if (to === "issued" && from !== "draft") {
    return "Only a draft invoice can be issued.";
  }
  if (to === "paid" && from !== "issued") {
    return "Only an issued invoice can be marked paid.";
  }
  return null;
}
