"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { changeOrdersCollection, ensureChangeIndexes } from "@/lib/changes";
import { ensureQuoteIndexes, quotesCollection } from "@/lib/quotes";
import {
  DEFAULT_BUSINESS,
  deriveInvoice,
  dueDayFrom,
  ensureInvoiceIndexes,
  invoicesCollection,
  makeInvoiceEvent,
  nextInvoiceReference,
  transitionError,
  type DerivedInvoice,
  type InvoiceDoc,
  type InvoiceStatus,
} from "@/lib/invoices";

/* ------------------------------------------------------------------
   Invoice server actions.

   Every action re-reads the authoritative documents and re-checks its
   guard before writing. The UI's buttons are a convenience; these checks
   are the rule. Nothing here trusts a total sent from the client — the
   money is always derived from the quote and change orders.
   ------------------------------------------------------------------ */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type InvoiceListRow = {
  reference: string;
  jobReference: string;
  quoteReference: string;
  jobTitle: string;
  customer: string;
  city: string;
  currency: string;
  status: InvoiceStatus;
  totalCents: number;
  dueCents: number;
  pendingCents: number;
  approvedChangesCents: number;
  baselineCents: number;
  dueAt: string;
  issuedAt: string;
  paidAt?: string;
  daysOverdue: number;
  staleSinceExport: boolean;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Rebuild one invoice from its documents. Returns null if it is gone. */
async function loadDerived(reference: string): Promise<DerivedInvoice | null> {
  const db = await getDb();
  const doc = await invoicesCollection(db).findOne({ reference });
  if (!doc) return null;

  const [quote, changes] = await Promise.all([
    quotesCollection(db).findOne({ reference: doc.quoteReference }),
    changeOrdersCollection(db)
      .find({ jobReference: doc.jobReference })
      .sort({ createdAt: 1 })
      .toArray(),
  ]);

  if (!quote) return null;
  return deriveInvoice(doc, quote as never, changes as never);
}

/* ------------------------------------------------------------------
   Reads
   ------------------------------------------------------------------ */

/**
 * The invoice list, derived live.
 *
 * Totals are recomputed from quotes and change orders on every read rather
 * than read from the invoice document, which is what makes the figure on
 * this screen impossible to stale out.
 */
export async function getInvoices(): Promise<InvoiceListRow[]> {
  const db = await getDb();
  await Promise.all([ensureInvoiceIndexes(db), ensureQuoteIndexes(db), ensureChangeIndexes(db)]);

  const docs = await invoicesCollection(db).find({}).sort({ issuedAt: -1 }).toArray();
  if (docs.length === 0) return [];

  const jobRefs = docs.map((doc) => doc.jobReference);
  const [quotes, changes] = await Promise.all([
    quotesCollection(db)
      .find({ jobReference: { $in: jobRefs } })
      .toArray(),
    changeOrdersCollection(db)
      .find({ jobReference: { $in: jobRefs } })
      .toArray(),
  ]);

  const quoteByJob = new Map(quotes.map((quote) => [String(quote.jobReference), quote]));
  const changesByJob = new Map<string, typeof changes>();
  for (const change of changes) {
    const key = String(change.jobReference);
    const list = changesByJob.get(key) ?? [];
    list.push(change);
    changesByJob.set(key, list);
  }

  const nowDay = today();

  const rows = docs
    .map((doc): InvoiceListRow | null => {
      const quote = quoteByJob.get(doc.jobReference) ?? quoteByJob.get(doc.quoteReference);
      if (!quote) return null;

      const invoice = deriveInvoice(
        doc as InvoiceDoc,
        quote as never,
        (changesByJob.get(doc.jobReference) ?? []) as never,
      );

      const overdue =
        invoice.status === "issued" && invoice.dueAt < nowDay
          ? Math.round(
              (Date.parse(`${nowDay}T00:00:00Z`) - Date.parse(`${invoice.dueAt}T00:00:00Z`)) /
                86_400_000,
            )
          : 0;

      return {
        reference: invoice.reference,
        jobReference: invoice.jobReference,
        quoteReference: invoice.quoteReference,
        jobTitle: invoice.jobTitle,
        customer: invoice.customer.name,
        city: invoice.site.city,
        currency: invoice.currency,
        status: invoice.status,
        totalCents: invoice.totalCents,
        // Settled and void invoices are owed nothing.
        dueCents: invoice.status === "issued" ? invoice.totalCents : 0,
        pendingCents: invoice.pendingChangesCents,
        approvedChangesCents: invoice.approvedChangesCents,
        baselineCents: invoice.baselineCents,
        dueAt: invoice.dueAt,
        issuedAt: invoice.issuedAt,
        paidAt: invoice.paidAt,
        daysOverdue: overdue,
        staleSinceExport: invoice.staleSinceExport,
      };
    })
    .filter((row): row is InvoiceListRow => row !== null);

  return rows;
}

/** A single invoice, fully derived, for the drawer and the PDF. */
export async function getInvoice(reference: string): Promise<DerivedInvoice | null> {
  if (!reference) return null;
  return loadDerived(reference);
}

/** Aggregates for the stat strip. Derived from the same rows the list shows. */
export async function getInvoiceStats() {
  const rows = await getInvoices();
  const outstanding = rows.filter((row) => row.status === "issued");
  const paid = rows.filter((row) => row.status === "paid");
  const drafts = rows.filter((row) => row.status === "draft");

  return {
    outstandingCount: outstanding.length,
    outstandingCents: outstanding.reduce((sum, row) => sum + row.totalCents, 0),
    overdueCount: outstanding.filter((row) => row.daysOverdue > 0).length,
    overdueCents: outstanding
      .filter((row) => row.daysOverdue > 0)
      .reduce((sum, row) => sum + row.totalCents, 0),
    paidCount: paid.length,
    paidCents: paid.reduce((sum, row) => sum + row.totalCents, 0),
    draftCount: drafts.length,
    draftCents: drafts.reduce((sum, row) => sum + row.totalCents, 0),
    pendingCents: rows.reduce((sum, row) => sum + row.pendingCents, 0),
  };
}

/**
 * Jobs that may still get an invoice: approved quote, no invoice yet.
 *
 * A job without an approved quote has no agreed baseline to bill, so it is
 * excluded here and rejected again in `createInvoice`.
 */
export async function getInvoiceableJobs() {
  const db = await getDb();
  const existing = await invoicesCollection(db).find({}, { projection: { jobReference: 1 } }).toArray();
  const taken = new Set(existing.map((doc) => doc.jobReference));

  const quotes = await quotesCollection(db)
    .find({ status: "approved" })
    .sort({ decidedAt: -1 })
    .toArray();

  return quotes
    .filter((quote) => !taken.has(String(quote.jobReference)))
    .map((quote) => ({
      jobReference: String(quote.jobReference),
      quoteReference: String(quote.reference),
      jobTitle: String(quote.title || ""),
      customer: String(quote.customer?.name || ""),
      city: String(quote.site?.city || ""),
      currency: String(quote.currency || "GBP").toUpperCase(),
      baselineCents: Number(quote.subtotalCents) || 0,
      approvedChangesCents: Number(quote.approvedChangesCents) || 0,
      pendingChangesCents: Number(quote.pendingChangesCents) || 0,
    }));
}

/* ------------------------------------------------------------------
   Mutations
   ------------------------------------------------------------------ */

const MAX_TERMS = 365;
const MAX_NOTES = 1200;

export type CreateInvoiceInput = {
  jobReference: string;
  termsDays: number;
  notes: string;
};

/**
 * Create the single invoice for a job.
 *
 * Rejects anything without an approved quote: an invoice bills an agreed
 * baseline, and there is no agreed baseline before approval.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<ActionResult<{ reference: string }>> {
  const jobReference = String(input.jobReference || "").trim();
  if (!jobReference) {
    return { ok: false, error: "Choose a job to invoice." };
  }

  const termsDays = Math.round(Number(input.termsDays) || 0);
  if (!Number.isFinite(termsDays) || termsDays < 0 || termsDays > MAX_TERMS) {
    return { ok: false, error: `Payment terms must be between 0 and ${MAX_TERMS} days.` };
  }

  const notes = String(input.notes || "").trim();
  if (notes.length > MAX_NOTES) {
    return { ok: false, error: `Keep notes under ${MAX_NOTES} characters.` };
  }

  const db = await getDb();
  await ensureInvoiceIndexes(db);

  // One invoice per job. Checked here for a clear message; the unique index
  // is what actually prevents the race.
  const existing = await invoicesCollection(db).findOne({ jobReference });
  if (existing) {
    return { ok: false, error: `This job already has invoice ${existing.reference}.` };
  }

  const quote = await quotesCollection(db).findOne({ jobReference });
  if (!quote) return { ok: false, error: "This job has no quote to invoice." };
  if (quote.status !== "approved") {
    return {
      ok: false,
      error: "Only a job with an approved quote can be invoiced.",
    };
  }

  const reference = await nextInvoiceReference(db);
  const issuedAt = today();
  const now = new Date().toISOString();

  const doc: InvoiceDoc = {
    _id: new ObjectId(),
    reference,
    jobReference,
    quoteReference: String(quote.reference),
    status: "draft",
    currency: String(quote.currency || "GBP").toUpperCase(),
    jobTitle: String(quote.title || ""),
    customer: {
      name: String(quote.customer?.name || ""),
      email: String(quote.customer?.email || ""),
      phone: String(quote.customer?.phone || ""),
    },
    site: { city: String(quote.site?.city || "") },
    business: DEFAULT_BUSINESS,
    issuedAt,
    dueAt: dueDayFrom(issuedAt, termsDays),
    termsDays,
    notes,
    activity: [
      makeInvoiceEvent(
        "created",
        "Invoice created",
        `Draft raised against ${quote.reference}.`,
        now,
      ),
    ],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await invoicesCollection(db).insertOne(doc);
  } catch (error) {
    // The unique index on jobReference is the real guard against two
    // concurrent creates; translate it into a readable message.
    if ((error as { code?: number })?.code === 11000) {
      return { ok: false, error: "This job already has an invoice." };
    }
    throw error;
  }

  revalidate();
  return { ok: true, data: { reference } };
}

/** Move a draft invoice to issued. Customers only see issued invoices. */
export async function issueInvoice(reference: string): Promise<ActionResult<null>> {
  return transition(reference, "issued", "issued", "Invoice issued", "Sent to the customer.");
}

/** Record that the customer has paid. Terminal. */
export async function markInvoicePaid(reference: string): Promise<ActionResult<null>> {
  return transition(reference, "paid", "paid", "Marked paid", "Payment received.");
}

/** Cancel an invoice that will never be paid. */
export async function voidInvoice(
  reference: string,
  reason: string,
): Promise<ActionResult<null>> {
  const trimmed = String(reason || "").trim();
  return transition(reference, "void", "voided", "Invoice voided", trimmed || "Cancelled.");
}

/**
 * Shared state transition.
 *
 * The guard runs against the status read from the database inside this
 * call, so a stale UI (two tabs, or a slow click) cannot force an illegal
 * state — the second one simply fails.
 */
async function transition(
  reference: string,
  to: InvoiceStatus,
  eventType: "issued" | "paid" | "voided",
  label: string,
  detail: string,
): Promise<ActionResult<null>> {
  if (!reference) return { ok: false, error: "Missing invoice reference." };

  const db = await getDb();
  const invoices = invoicesCollection(db);
  const doc = await invoices.findOne({ reference });
  if (!doc) return { ok: false, error: "That invoice no longer exists." };

  const blocked = transitionError(doc.status, to);
  if (blocked) return { ok: false, error: blocked };

  const now = new Date().toISOString();
  const set: Partial<InvoiceDoc> = {
    status: to,
    updatedAt: now,
  };

  if (to === "issued") {
    // Re-derive the due date from today: a draft that sat for a month must
    // not arrive already overdue.
    set.issuedAt = today();
    set.dueAt = dueDayFrom(set.issuedAt, doc.termsDays);
  }
  if (to === "paid") {
    set.paidAt = now;
  }
  if (to === "void") {
    set.voidedAt = now;
    set.voidReason = detail;
  }

  const result = await invoices.updateOne(
    // Status in the filter makes this a compare-and-set: if another request
    // changed the status first, this update matches nothing.
    { reference, status: doc.status },
    {
      $set: set,
      $push: { activity: makeInvoiceEvent(eventType, label, detail, now) },
    },
  );

  if (result.matchedCount === 0) {
    return { ok: false, error: "This invoice changed while you were working. Reload and try again." };
  }

  revalidate();
  return { ok: true, data: null };
}

/**
 * Record that a PDF of the current figures was exported.
 *
 * This does NOT freeze the invoice — it stores what that PDF said so the UI
 * can warn that the live total has since moved. The snapshot is a note, not
 * a balance.
 */
export async function recordInvoiceExport(
  reference: string,
): Promise<ActionResult<{ snapshotCents: number }>> {
  const db = await getDb();
  const doc = await invoicesCollection(db).findOne({ reference });
  if (!doc) return { ok: false, error: "That invoice no longer exists." };

  const derived = await loadDerived(reference);
  if (!derived) return { ok: false, error: "That invoice could not be read." };

  const now = new Date().toISOString();
  await invoicesCollection(db).updateOne(
    { reference },
    {
      $set: { issuedSnapshotCents: derived.totalCents, updatedAt: now },
      $push: {
        activity: makeInvoiceEvent(
          "noted",
          "PDF exported",
          `Exported at ${formatCents(derived.totalCents, derived.currency)}.`,
          now,
        ),
      },
    },
  );

  revalidate();
  return { ok: true, data: { snapshotCents: derived.totalCents } };
}

function formatCents(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(cents / 100);
}

function revalidate() {
  revalidatePath("/invoices");
  revalidatePath("/");
}
