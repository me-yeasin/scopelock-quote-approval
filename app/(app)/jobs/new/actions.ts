"use server";

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import {
  buildLines,
  ensureQuoteIndexes,
  makeEvent,
  newLinkToken,
  nextQuoteReference,
  quotesCollection,
  sumLines,
  type QuoteDoc,
} from "@/lib/quotes";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

type Currency = "GBP" | "EUR";

type LineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type Draft = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  jobTitle: string;
  jobDate: string;
  currency: Currency;
  items: LineItem[];
  notes: string;
  validUntil: string;
};

export type CreateJobResult =
  | { ok: true; jobId: string; reference: string; quoteReference: string }
  | { ok: false; error: string };

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function toCents(value: string) {
  return Math.round((Number(value) || 0) * 100);
}

function lineTotalCents(item: LineItem) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  return Math.round(quantity * unitPrice * 100);
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

/* ------------------------------------------------------------------
   Action
   ------------------------------------------------------------------ */

/**
 * createJob — server-side persistence for a new job + quote.
 *
 * Runs as a Server Action: the implementation never ships to the client.
 * The draft is passed as a JSON string (a mitigated, client-supplied shape)
 * and re-validated here, because render-time gating is not a security
 * boundary. The returned value is shaped for the UI, not a raw DB record.
 */
export async function createJob(draftJson: string): Promise<CreateJobResult> {
  let draft: Draft;
  try {
    draft = JSON.parse(draftJson) as Draft;
  } catch {
    return { ok: false, error: "Could not read the quote data." };
  }

  // Re-validate on the server. The client already checked this, but a
  // Server Action is reachable by anyone who can POST to the route.
  const errors: string[] = [];
  if (!readString(draft.customerName).trim()) {
    errors.push("Enter the customer's name.");
  }
  if (!readString(draft.jobTitle).trim()) {
    errors.push("Give this job a short title.");
  }
  if (!readString(draft.jobDate)) {
    errors.push("Choose the job date.");
  }
  if (draft.currency !== "EUR" && draft.currency !== "GBP") {
    errors.push("Currency must be GBP or EUR.");
  }

  const items = Array.isArray(draft.items) ? draft.items : [];
  const cleanedItems = items
    .map((rawItem, index) => {
      const item =
        rawItem && typeof rawItem === "object"
          ? (rawItem as Record<string, unknown>)
          : {};
      return {
        id: readString(item.id, `restored-${index}`),
        description: readString(item.description),
        quantity: readString(item.quantity, "1"),
        unitPrice: readString(item.unitPrice),
      };
    })
    .filter(
      (item) =>
        item.description.trim() && Number(item.quantity) > 0 && Number(item.unitPrice) > 0,
    );

  if (cleanedItems.length === 0) {
    errors.push("Add at least one line item with a description and a price.");
  }
  if (!readString(draft.validUntil)) {
    errors.push("Choose how long the quote is valid.");
  }

  if (errors.length > 0) {
    return { ok: false, error: errors[0] };
  }

  const totalCents = cleanedItems.reduce(
    (sum, item) => sum + lineTotalCents(item),
    0,
  );

  const now = new Date().toISOString();
  const _id = new ObjectId();
  const reference = `J-${_id.getTimestamp().getFullYear()}-${_id.toString().slice(-4).toUpperCase()}`;

  const doc = {
    _id,
    reference,
    status: "draft" as const,
    currency: draft.currency,
    customer: {
      name: readString(draft.customerName).trim(),
      email: readString(draft.customerEmail).trim(),
      phone: readString(draft.customerPhone).trim(),
    },
    site: {
      addressLine1: readString(draft.addressLine1).trim(),
      addressLine2: readString(draft.addressLine2).trim(),
      city: readString(draft.city).trim(),
      postcode: readString(draft.postcode).trim(),
    },
    job: {
      title: readString(draft.jobTitle).trim(),
      date: readString(draft.jobDate),
    },
    items: cleanedItems.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitPriceCents: toCents(item.unitPrice),
      totalCents: lineTotalCents(item),
    })),
    notes: readString(draft.notes).trim(),
    validUntil: readString(draft.validUntil),
    totalCents,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const db = await getDb();
    await ensureQuoteIndexes(db);

    const now = doc.createdAt;
    const lines = buildLines(
      cleanedItems.map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unitPriceCents: toCents(item.unitPrice),
      })),
    );

    // A job is never useful without its quote, so both documents are written
    // in one transaction: either the workspace gets a job *and* a quote, or
    // nothing is persisted and the user sees a single error.
    const session = db.client.startSession();
    let quoteReference = "";

    try {
      await session.withTransaction(async () => {
        await db.collection("jobs").insertOne(doc, { session });

        quoteReference = await nextQuoteReference(db, new Date(now));

        const quote: QuoteDoc = {
          _id: new ObjectId(),
          reference: quoteReference,
          jobReference: reference,
          jobId: _id,
          // New quotes start as drafts — the scope is not agreed until the
          // customer approves the approval link.
          status: "draft",
          currency: draft.currency,
          title: readString(draft.jobTitle).trim(),
          customer: {
            name: readString(draft.customerName).trim(),
            email: readString(draft.customerEmail).trim(),
            phone: readString(draft.customerPhone).trim(),
          },
          site: { city: readString(draft.city).trim() },
          lines,
          // Snapshot of the quote baseline. Change orders are tracked
          // separately and only ever added on top of this figure.
          subtotalCents: sumLines(lines),
          approvedChangesCents: 0,
          pendingChangesCents: 0,
          notes: readString(draft.notes).trim(),
          issuedAt: now,
          validUntil: readString(draft.validUntil),
          activity: [
            makeEvent(
              "created",
              "Quote created",
              `Built from job ${reference}`,
              now,
            ),
          ],
          createdAt: now,
          updatedAt: now,
        };

        await quotesCollection(db).insertOne(quote, { session });
      });
    } finally {
      await session.endSession();
    }

    return {
      ok: true,
      jobId: _id.toString(),
      reference,
      quoteReference,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the job.",
    };
  }
}