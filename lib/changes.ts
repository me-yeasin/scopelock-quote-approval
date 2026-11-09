import { ObjectId, type Collection, type Db } from "mongodb";

/* ------------------------------------------------------------------
   Change order domain — storage shapes, numbering, and line maths.

   A change order is the only legal way to move a job's price after its
   quote has been approved. The rules this module enforces:

   - The approved quote is the *baseline* and is never rewritten. The job
     total is baseline + every approved change.
   - Only approved changes are billable. Draft, sent, rejected, expired
     and withdrawn orders contribute nothing.
   - Money is integer minor units plus an ISO 4217 currency code, never
     floats, and never a negative price: a reduction is stored as a
     positive magnitude with `direction: "credit"`.
   - Numbers are a gapless per-year sequence, like quotes, because they
     are numbered commercial documents (HMRC / EU VAT).
   ------------------------------------------------------------------ */

export type ChangeStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "withdrawn";

export const CHANGE_STATUSES: ChangeStatus[] = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
  "withdrawn",
];

export type ChangeKind =
  | "extra-work"
  | "variation"
  | "omission"
  | "materials"
  | "delay";

export const CHANGE_KINDS: ChangeKind[] = [
  "extra-work",
  "variation",
  "omission",
  "materials",
  "delay",
];

/** Stored line item. `direction` decides whether it adds or credits. */
export type StoredChangeLine = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** Signed effect of this line, in minor units. Derived on write. */
  totalCents: number;
  direction: "add" | "credit";
};

export type ChangeLink = {
  token: string;
  sentAt: string;
  sentTo: string;
  method: "email" | "sms" | "copy";
};

export type ChangeEvent = {
  type: "created" | "sent" | "viewed" | "approved" | "rejected" | "edited" | "withdrawn";
  label: string;
  detail: string;
  at: string;
};

export type ChangeDoc = {
  _id: ObjectId;
  /** Gapless per-year number, e.g. CO-2026-0003. */
  reference: string;
  /** Parent job, by reference — the document that owns this change. */
  jobReference: string;
  jobId?: ObjectId;
  /** The approved quote this change is measured against. */
  quoteReference: string;
  status: ChangeStatus;
  kind: ChangeKind;
  currency: string;
  /** Denormalised for the list; refreshed from the job on write. */
  jobTitle: string;
  customer: { name: string; email: string; phone: string };
  site: { city: string };
  /** One-line headline shown in the list. */
  summary: string;
  /** The full explanation shown in the drawer and to the customer. */
  reason: string;
  lines: StoredChangeLine[];
  /** Frozen quote subtotal at the moment this change was raised. */
  baselineCents: number;
  /** Signed net effect: sum of line totals. Never negative fields, only signed sum. */
  netCents: number;
  issuedAt: string;
  validUntil: string;
  link?: ChangeLink;
  decidedAt?: string;
  rejectionReason?: string;
  activity: ChangeEvent[];
  createdAt: string;
  updatedAt: string;
};

const COUNTERS = "counters";

/* ------------------------------------------------------------------
   Numbering
   ------------------------------------------------------------------ */

/**
 * Reserve the next change-order number for a year.
 *
 * Same contract as `nextQuoteReference`: an atomic `$inc` so two
 * concurrent raises cannot collide, and the counter is bumped *before*
 * the document is written. A failed write therefore burns a number
 * rather than handing the same one out twice.
 */
export async function nextChangeReference(db: Db, now = new Date()): Promise<string> {
  const year = now.getFullYear();
  const counters = db.collection<{ _id: string; seq: number }>(COUNTERS);

  const result = await counters.findOneAndUpdate(
    { _id: `change:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );

  const seq = result?.seq ?? 1;
  return `CO-${year}-${String(seq).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------
   Line maths

   The single place the add/credit sign is applied. Keeping it here means
   no caller can accidentally turn a credit into an increase.
   ------------------------------------------------------------------ */

export function changeLineTotal(item: {
  quantity: number;
  unitPriceCents: number;
  direction: "add" | "credit";
}): number {
  const magnitude = Math.round(item.quantity * item.unitPriceCents);
  return item.direction === "credit" ? -magnitude : magnitude;
}

export function buildChangeLines(
  raw: {
    description: string;
    quantity: number;
    unitPriceCents: number;
    direction: "add" | "credit";
  }[],
): StoredChangeLine[] {
  return raw.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    direction: item.direction,
    totalCents: changeLineTotal(item),
  }));
}

export function sumChangeLines(lines: StoredChangeLine[]): number {
  return lines.reduce((sum, line) => sum + line.totalCents, 0);
}

/* ------------------------------------------------------------------
   Indexes
   ------------------------------------------------------------------ */

let indexesEnsured = false;

/** Create the change-order indexes once per server process. */
export async function ensureChangeIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;

  const changes = db.collection<ChangeDoc>("changeOrders");
  await Promise.all([
    // References are the lookup key for every read and mutation.
    changes.createIndex({ reference: 1 }, { unique: true }),
    // "Every change on this job" — the query behind the job drawer.
    changes.createIndex({ jobReference: 1, createdAt: -1 }),
    // The list ordering and the status filter chips.
    changes.createIndex({ status: 1, createdAt: -1 }),
    // Recomputing a job total only needs the approved ones.
    changes.createIndex({ jobReference: 1, status: 1 }),
    // Approval-link lookups on the public route.
    changes.createIndex({ "link.token": 1 }, { sparse: true }),
  ]);

  indexesEnsured = true;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

export function newChangeToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeChangeEvent(
  type: ChangeEvent["type"],
  label: string,
  detail: string,
  at = new Date().toISOString(),
): ChangeEvent {
  return { type, label, detail, at };
}

export function changeOrdersCollection(db: Db): Collection<ChangeDoc> {
  return db.collection<ChangeDoc>("changeOrders");
}

/* ------------------------------------------------------------------
   The job total

   A job's price is its approved quote plus every approved change. This
   is the only function that computes it, so the Jobs screen, the Quotes
   screen and the Change Orders screen can never disagree.

   The quote baseline is read from the quote document rather than the job
   line items: a quote edited after approval is impossible (it is frozen),
   and the quote subtotal is the figure the customer actually agreed to.
   ------------------------------------------------------------------ */

export type JobTotalBreakdown = {
  baselineCents: number;
  approvedCents: number;
  pendingCents: number;
  totalCents: number;
};

export async function computeJobTotal(
  db: Db,
  jobReference: string,
  quoteBaselineCents: number,
  session?: import("mongodb").ClientSession,
): Promise<JobTotalBreakdown> {
  const changes = changeOrdersCollection(db);
  // Inside a transaction the reads MUST join the session, otherwise they
  // take a snapshot from before this transaction's own writes and the
  // recomputed total silently ignores the change being decided right now.
  const opts = session ? { session } : {};

  const [approved, pending] = await Promise.all([
    changes
      .aggregate<{ _id: null; sum: number }>(
        [
          { $match: { jobReference, status: "approved" } },
          { $group: { _id: null, sum: { $sum: "$netCents" } } },
        ],
        opts,
      )
      .toArray(),
    changes
      .aggregate<{ _id: null; sum: number }>(
        [
          // Pending exposure: everything raised but not yet agreed. A draft
          // counts here even though the customer has never seen it, because
          // this figure answers "how much could still be added", not "what
          // is billable".
          { $match: { jobReference, status: { $in: ["draft", "sent"] } } },
          { $group: { _id: null, sum: { $sum: "$netCents" } } },
        ],
        opts,
      )
      .toArray(),
  ]);

  const approvedCents = approved[0]?.sum ?? 0;
  const pendingCents = pending[0]?.sum ?? 0;

  return {
    baselineCents: quoteBaselineCents,
    approvedCents,
    pendingCents,
    // Only approved money is billable.
    totalCents: quoteBaselineCents + approvedCents,
  };
}

/**
 * Write the recomputed totals onto the quote and the job.
 *
 * Called inside the same transaction as every change-order decision, so a
 * change can never be approved without the job total moving with it.
 */
export async function syncJobTotals(
  db: Db,
  jobReference: string,
  breakdown: JobTotalBreakdown,
  now: string,
  session?: import("mongodb").ClientSession,
): Promise<void> {
  const opts = session ? { session } : {};

  await db
    .collection("quotes")
    .updateOne(
      { jobReference },
      {
        $set: {
          approvedChangesCents: breakdown.approvedCents,
          pendingChangesCents: breakdown.pendingCents,
          updatedAt: now,
        },
      },
      opts,
    );

  await db
    .collection("jobs")
    .updateOne(
      { reference: jobReference },
      { $set: { totalCents: breakdown.totalCents, updatedAt: now } },
      opts,
    );
}

/**
 * Expire change orders whose validity date has passed.
 *
 * Same contract as `expireStaleQuotes`: only unsettled orders move, and
 * the sweep is safe to run repeatedly. Expiring is not billable and does
 * not change the job total.
 */
export async function expireStaleChanges(db: Db): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  const result = await changeOrdersCollection(db).updateMany(
    {
      status: { $in: ["draft", "sent"] },
      validUntil: { $lt: today, $ne: "" },
    },
    { $set: { status: "expired", updatedAt: new Date().toISOString() } },
  );

  return result.modifiedCount;
}
