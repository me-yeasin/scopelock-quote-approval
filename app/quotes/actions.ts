"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  ensureQuoteIndexes,
  makeEvent,
  newLinkToken,
  quotesCollection,
  type QuoteDoc,
  type QuoteStatus,
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
    const docs = await quotesCollection(db).find({}).sort({ createdAt: -1 }).toArray();
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
    const doc = await quotesCollection(db).findOne({ reference });
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

    const existing = await quotes.findOne({ reference });
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
      { reference, status: { $in: ["draft", "sent", "expired"] } },
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
      { reference, status: "sent" },
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
          { reference: quote.jobReference },
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
