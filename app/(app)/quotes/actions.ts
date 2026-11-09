"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireOwnerId } from "@/lib/ownership";
import {
  ensureQuoteIndexes,
  lineTotalCents,
  makeEvent,
  newLinkToken,
  quotesCollection,
  sumLines,
  type QuoteDoc,
  type QuoteStatus,
  type StoredLineItem,
} from "@/lib/quotes";
import type { Quote } from "@/lib/quotes-types";

/* ------------------------------------------------------------------
   Result types
   ------------------------------------------------------------------ */

export type GetQuotesResult =
  | { ok: true; quotes: Quote[] }
  | { ok: false; error: string };

export type QuoteActionResult =
  | { ok: true; quote: Quote }
  | { ok: false; error: string };

/* ------------------------------------------------------------------
   Mapping: stored document -> UI view model

   The UI receives fully-formatted strings so the client never has to
   re-implement money or date rules. Every value is derived from stored
   integer minor units, which keeps the display and the database in
   agreement.
   ------------------------------------------------------------------ */

function initialsFrom(name: string) {
  return name
    .replace(/\./g, "")
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function mapDocToQuote(doc: QuoteDoc): Quote {
  const currency = doc.currency === "EUR" ? "EUR" : "GBP";

  return {
    id: doc.reference,
    jobReference: doc.jobReference,
    title: doc.title || "Untitled quote",
    customer: doc.customer?.name ?? "",
    customerInitials: initialsFrom(doc.customer?.name || "?"),
    customerEmail: doc.customer?.email ?? "",
    customerPhone: doc.customer?.phone ?? "",
    city: doc.site?.city ?? "",
    currency,
    status: doc.status,
    lines: doc.lines.map((line, index) => ({
      id: `l${index + 1}`,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    })),
    // Only approved changes are part of the job total; pending ones are shown
    // but explicitly excluded from what the customer is billed.
    approvedChangesCents: doc.approvedChangesCents ?? 0,
    pendingChangesCents: doc.pendingChangesCents ?? 0,
    notes: doc.notes ?? "",
    issuedAt: doc.issuedAt,
    validUntil: doc.validUntil,
    link: doc.link
      ? {
          url: `/q/${doc.link.token}`,
          sentAt: doc.link.sentAt,
          sentTo: doc.link.sentTo,
          method: doc.link.method,
        }
      : undefined,
    decidedAt: doc.decidedAt,
    rejectionReason: doc.rejectionReason,
    activity: (doc.activity ?? []).map((event, index) => ({
      id: `e${index}`,
      label: event.label,
      detail: event.detail,
      at: event.at,
    })),
  };
}

/* ------------------------------------------------------------------
   Actions
   ------------------------------------------------------------------ */

/** Load every quote, newest first. */
export async function getQuotes(): Promise<GetQuotesResult> {
  try {
    const db = await getDb();
    const ownerId = await requireOwnerId();
    const docs = await quotesCollection(db).find({ ownerId }).sort({ createdAt: -1 }).toArray();
    return { ok: true, quotes: docs.map(mapDocToQuote) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load quotes.",
    };
  }
}

/** Load a single quote by reference, after anything changed it. */
export async function getQuote(reference: string): Promise<QuoteActionResult> {
  if (!reference) return { ok: false, error: "Missing quote reference." };

  try {
    const db = await getDb();
    const doc = await quotesCollection(db).findOne({ reference, ownerId: await requireOwnerId() });
    if (!doc) return { ok: false, error: "That quote no longer exists." };
    return { ok: true, quote: mapDocToQuote(doc) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the quote.",
    };
  }
}

/**
 * Send a draft quote for approval.
 *
 * Issues an opaque token once and stores it with the send metadata. Only
 * drafts and expired quotes can be (re)sent — once a customer has approved
 * or rejected, the scope is settled and further changes must go through a
 * change order, not by re-sending the quote.
 */
export async function sendQuote(
  reference: string,
  method: "email" | "sms" | "copy" = "copy",
): Promise<QuoteActionResult> {
  if (!reference) return { ok: false, error: "Missing quote reference." };

  try {
    const db = await getDb();
    await ensureQuoteIndexes(db);
    const quotes = quotesCollection(db);

    const ownerId = await requireOwnerId();
    const existing = await quotes.findOne({ reference, ownerId });
    if (!existing) return { ok: false, error: "That quote no longer exists." };

    if (existing.status === "approved" || existing.status === "rejected") {
      return {
        ok: false,
        error: "This quote is already settled. Add a change order instead.",
      };
    }

    if (existing.lines.length === 0) {
      return { ok: false, error: "Add at least one line item before sending." };
    }

    const now = new Date().toISOString();
    const sentTo =
      method === "sms" ? existing.customer?.phone ?? "" : existing.customer?.email ?? "";

    const quote = await quotes.findOneAndUpdate(
      { reference, ownerId, status: { $in: ["draft", "sent", "expired"] } },
      {
        $set: {
          status: "sent",
          // Re-use an existing token so a customer holding the old link is not
          // locked out by a resend.
          "link.token": existing.link?.token ?? newLinkToken(),
          "link.sentAt": now,
          "link.sentTo": sentTo,
          "link.method": method,
          updatedAt: now,
        },
        $push: {
          activity: makeEvent(
            "sent",
            "Sent for approval",
            sentTo ? `Sent to ${sentTo}` : "Approval link copied",
            now,
          ),
        },
      },
      { returnDocument: "after" },
    );

    if (!quote) {
      return { ok: false, error: "The quote changed while sending. Reload and try again." };
    }

    revalidatePath("/quotes");
    return { ok: true, quote: mapDocToQuote(quote) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not send the quote.",
    };
  }
}

/**
 * Record a customer's decision.
 *
 * This is the transition that "locks" the scope, so it is guarded: only a
 * sent quote can be decided, and a decision can never be silently replayed
 * over an already-settled quote.
 */
export async function decideQuote(
  reference: string,
  decision: Extract<QuoteStatus, "approved" | "rejected">,
  reason?: string,
): Promise<QuoteActionResult> {
  if (!reference) return { ok: false, error: "Missing quote reference." };
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "Invalid decision." };
  }

  try {
    const db = await getDb();
    const ownerId = await requireOwnerId();
    const now = new Date().toISOString();

    const update: Record<string, unknown> = {
      $set: {
        status: decision,
        decidedAt: now,
        updatedAt: now,
        ...(decision === "rejected" && reason ? { rejectionReason: reason } : {}),
      },
      $push: {
        activity: makeEvent(
          decision,
          decision === "approved" ? "Approved by customer" : "Rejected by customer",
          decision === "approved"
            ? "Scope is now locked as the baseline"
            : reason || "No reason given",
          now,
        ),
      },
    };

    const quote = await quotesCollection(db).findOneAndUpdate(
      { reference, ownerId, status: "sent" },
      update,
      { returnDocument: "after" },
    );

    if (!quote) {
      return { ok: false, error: "This quote is not awaiting a decision." };
    }

    // An approved quote starts the job; a rejected one leaves it pending.
    if (decision === "approved") {
      await db
        .collection("jobs")
        .updateOne(
          { reference: quote.jobReference, ownerId },
          { $set: { status: "inprogress", updatedAt: now } },
        );
    }

    revalidatePath("/quotes");
    revalidatePath("/jobs");

    return { ok: true, quote: mapDocToQuote(quote) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not record the decision.",
    };
  }
}

/** Mark quotes past their validity date as expired. Idempotent. */
export async function expireStaleQuotes(): Promise<{ ok: true; expired: number } | { ok: false; error: string }> {
  try {
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);

    const result = await quotesCollection(db).updateMany(
      {
        ownerId: await requireOwnerId(),
        status: { $in: ["draft", "sent"] },
        validUntil: { $lt: today, $ne: "" },
      },
      { $set: { status: "expired", updatedAt: new Date().toISOString() } },
    );

    if (result.modifiedCount > 0) revalidatePath("/quotes");
    return { ok: true, expired: result.modifiedCount };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not expire quotes.",
    };
  }
}

/* ------------------------------------------------------------------
   Editing
   ------------------------------------------------------------------
   A quote is editable while it is still "yours to change":

   - draft   : free to edit. The customer has never seen it.
   - sent    : free to edit too. The approval link is rotated as part of the
               same write, so the previous link stops working and the quote
               is copied out fresh. Saving is never blocked and never asks
               for confirmation.
   - approved / rejected : frozen. The scope is settled; changes belong in
               a change order, not in a rewrite of the baseline.

   Totals are never trusted from the client: line totals and the subtotal
   are re-derived here, and the linked job's total is updated in the same
   transaction so the Jobs and Quotes screens cannot disagree.
   ------------------------------------------------------------------ */

export type QuoteEditInput = {
  title: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  currency: "GBP" | "EUR";
  notes: string;
  validUntil: string;
  lines: { description: string; quantity: number; unitPriceCents: number }[];
};

export type QuoteEditResult =
  | { ok: true; quote: Quote; linkRotated: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MAX_TITLE = 120;
const MAX_NAME = 120;
const MAX_CITY = 80;
const MAX_LINE_DESC = 200;
const MAX_LINES = 50;
const MAX_QTY = 10_000;
const MAX_UNIT_CENTS = 100_000_000; // £1,000,000 per unit

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Re-derive every stored money field from the edited lines. */
function normalizeLines(raw: unknown): {
  lines: StoredLineItem[];
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const input = Array.isArray(raw) ? raw : [];

  if (input.length === 0) {
    errors.lines = "Add at least one line item.";
    return { lines: [], errors };
  }
  if (input.length > MAX_LINES) {
    errors.lines = `Keep it to ${MAX_LINES} line items or fewer.`;
    return { lines: [], errors };
  }

  const lines: StoredLineItem[] = [];

  input.forEach((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const description = str(item.description);
    const quantity = Number(item.quantity);
    const unitPriceCents = Math.round(Number(item.unitPriceCents));

    if (!description) {
      errors[`line.${index}.description`] = "Describe this item.";
      return;
    }
    if (description.length > MAX_LINE_DESC) {
      errors[`line.${index}.description`] = `Keep it under ${MAX_LINE_DESC} characters.`;
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QTY) {
      errors[`line.${index}.quantity`] = "Enter a quantity above 0.";
      return;
    }
    if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0 || unitPriceCents > MAX_UNIT_CENTS) {
      errors[`line.${index}.unitPrice`] = "Enter a valid price.";
      return;
    }

    lines.push({
      description,
      quantity,
      unitPriceCents,
      // Recomputed, never taken from the client.
      totalCents: lineTotalCents({ quantity, unitPriceCents }),
    });
  });

  return { lines, errors };
}

export async function updateQuote(
  reference: string,
  input: QuoteEditInput,
): Promise<QuoteEditResult> {
  if (!reference) return { ok: false, error: "Missing quote reference." };

  const fieldErrors: Record<string, string> = {};

  const title = str(input.title);
  const customerName = str(input.customerName);
  const customerEmail = str(input.customerEmail);
  const customerPhone = str(input.customerPhone);
  const city = str(input.city);
  const notes = str(input.notes);
  const validUntil = str(input.validUntil);

  if (!title) fieldErrors.title = "Give this quote a title.";
  else if (title.length > MAX_TITLE) fieldErrors.title = `Keep it under ${MAX_TITLE} characters.`;

  if (!customerName) fieldErrors.customerName = "Enter the customer's name.";
  else if (customerName.length > MAX_NAME)
    fieldErrors.customerName = `Keep it under ${MAX_NAME} characters.`;

  if (city.length > MAX_CITY) fieldErrors.city = `Keep it under ${MAX_CITY} characters.`;

  if (input.currency !== "GBP" && input.currency !== "EUR") {
    fieldErrors.currency = "Choose GBP or EUR.";
  }

  // A validity date is required so the link always has an expiry.
  if (!validUntil || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    fieldErrors.validUntil = "Choose a valid-until date.";
  }

  const { lines, errors: lineErrors } = normalizeLines(input.lines);
  Object.assign(fieldErrors, lineErrors);

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors };
  }

  try {
    const db = await getDb();
    const quotes = quotesCollection(db);

    const ownerId = await requireOwnerId();
    const existing = await quotes.findOne({ reference, ownerId });
    if (!existing) return { ok: false, error: "That quote no longer exists." };

    // Frozen once settled: the approved figure is the baseline the whole
    // product is built on, so it must never be rewritten.
    if (existing.status === "approved" || existing.status === "rejected") {
      return {
        ok: false,
        error:
          existing.status === "approved"
            ? "This quote is approved and locked. Add a change order to adjust the scope."
            : "This quote was rejected. Create a new quote instead of editing this one.",
      };
    }

    // A sent quote may already be in the customer's hands. Editing it is
    // allowed and saves straight away; the approval link is rotated as part
    // of the same write so the old link stops working and the new one is the
    // one the user copies. No intermediate confirmation step.
    const isShared = existing.status === "sent" || Boolean(existing.link);

    const subtotalCents = sumLines(lines);
    const now = new Date().toISOString();
    const rotateLink = isShared;

    const update: Record<string, unknown> = {
      $set: {
        title,
        currency: input.currency,
        "customer.name": customerName,
        "customer.email": customerEmail,
        "customer.phone": customerPhone,
        "site.city": city,
        notes,
        validUntil,
        lines,
        subtotalCents,
        updatedAt: now,
        // A shared quote that is edited goes back to "awaiting approval"
        // under a new link; a draft simply stays a draft.
        ...(rotateLink
          ? {
              status: "sent",
              "link.token": newLinkToken(),
              "link.sentAt": now,
              "link.method": "copy",
              "link.sentTo":
                existing.link?.method === "sms" ? customerPhone : customerEmail,
            }
          : {}),
      },
      $push: {
        activity: makeEvent(
          "edited",
          "Quote edited",
          rotateLink
            ? "Details updated and the previous approval link was replaced"
            : "Details updated before sending",
          now,
        ),
      },
    };

    const session = db.client.startSession();
    let updated: QuoteDoc | null = null;

    try {
      await session.withTransaction(async () => {
        updated = await quotes.findOneAndUpdate({ reference, ownerId }, update, {
          returnDocument: "after",
          session,
        });

        if (!updated) throw new Error("That quote no longer exists.");

        // Keep the job's headline total in step with the quote, so the two
        // screens can never show different numbers for the same work.
        await db
          .collection("jobs")
        await db
          .collection("jobs")
          .updateOne(
            { reference: updated.jobReference, ownerId },
            { $set: { totalCents: subtotalCents, updatedAt: now } },
            { session },
          );
      });
    } finally {
      await session.endSession();
    }

    if (!updated) return { ok: false, error: "Could not save the quote." };

    revalidatePath("/quotes");
    revalidatePath("/jobs");

    return {
      ok: true,
      quote: mapDocToQuote(updated),
      linkRotated: rotateLink,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the quote.",
    };
  }
}
