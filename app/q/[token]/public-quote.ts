"use server";

import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { quotesCollection, type QuoteDoc } from "@/lib/quotes";
import type { QuoteStatus } from "@/lib/quotes-types";
import { isExpired, isValidToken } from "./public-quote-shared";

/* ------------------------------------------------------------------
   Public (customer-facing) quote access.

   This module is the only place a stranger's request can read quote
   data, so it is deliberately narrow:

   - Lookup is by opaque token only. A quote reference (Q-2026-0001) is
     guessable; a token is not, so references are never accepted here.
   - Only fields the customer needs are returned. Internal notes, the
     activity trail and the plumber's other quotes stay server-side.
   - A quote is only visible once it has actually been sent. Drafts are
     invisible even to someone holding a token, so nothing leaks before
     the plumber is ready.
   ------------------------------------------------------------------ */

/** What the customer is allowed to see. Deliberately no internal fields. */
export type PublicQuote = {
  reference: string;
  jobReference: string;
  title: string;
  customerName: string;
  city: string;
  currency: "GBP" | "EUR";
  status: QuoteStatus;
  lines: { description: string; quantity: number; unitPriceCents: number }[];
  subtotalCents: number;
  approvedChangesCents: number;
  notes: string;
  issuedAt: string;
  validUntil: string;
  decidedAt?: string;
  rejectionReason?: string;
};

export type PublicQuoteResult =
  | { ok: true; quote: PublicQuote }
  | { ok: false; reason: "not-found" | "not-sent" | "error"; expired?: boolean };

function toPublicQuote(doc: QuoteDoc, now: Date): PublicQuote {
  // Expiry is derived at read time rather than trusted from the stored
  // status, so a customer never sees a live Approve button on a dead quote
  // even if the nightly sweep has not run yet.
  const expired =
    (doc.status === "sent" || doc.status === "draft") && isExpired(doc.validUntil, now);

  const status: QuoteStatus = expired ? "expired" : doc.status;

  return {
    reference: doc.reference,
    jobReference: doc.jobReference,
    title: doc.title || "Your quote",
    customerName: doc.customer?.name ?? "",
    city: doc.site?.city ?? "",
    currency: doc.currency === "EUR" ? "EUR" : "GBP",
    status,
    lines: (doc.lines ?? []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    })),
    subtotalCents: doc.subtotalCents ?? 0,
    approvedChangesCents: doc.approvedChangesCents ?? 0,
    notes: doc.notes ?? "",
    issuedAt: doc.issuedAt,
    validUntil: doc.validUntil,
    decidedAt: doc.decidedAt,
    rejectionReason: doc.rejectionReason,
  };
}

/** Load a quote for the public page. Never throws to the caller. */
export async function getPublicQuote(token: string): Promise<PublicQuoteResult> {
  if (!isValidToken(token)) return { ok: false, reason: "not-found" };

  // A token page can never be prerendered: the answer depends entirely on
  // the incoming request, and both the clock and the database read are
  // request-time values. `connection()` marks that boundary so Next.js
  // renders this on demand instead of failing the build.
  await connection();

  try {
    const db = await getDb();
    const doc = await quotesCollection(db).findOne({ "link.token": token });

    // A token that matches nothing is indistinguishable from a malformed
    // one on purpose: no hint about which part was wrong.
    if (!doc) return { ok: false, reason: "not-found" };

    // Never reveal a quote the plumber has not actually shared. A rotated
    // token means this one is stale, and a draft was never sent at all.
    if (doc.status === "draft") return { ok: false, reason: "not-sent" };

    const now = new Date();
    const publicQuote = toPublicQuote(doc, now);
    return { ok: true, quote: publicQuote };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/* ------------------------------------------------------------------
   Customer decision
   ------------------------------------------------------------------ */

export type CustomerDecisionResult =
  | { ok: true; status: "approved" | "rejected" }
  | { ok: false; error: string };

/**
 * Record the customer's approval or rejection.
 *
 * The token — not a quote reference — is the credential, and the update is
 * guarded on `status: "sent"` so the same link cannot be approved twice,
 * nor approve a quote that already expired. `decideQuote` in the dashboard
 * is deliberately *not* reused: it trusts an internal reference and has no
 * token check, so exposing it publicly would let anyone decide any quote.
 */
export async function decideQuoteByToken(
  token: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<CustomerDecisionResult> {
  if (!isValidToken(token)) return { ok: false, error: "This link is not valid." };
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "Invalid decision." };
  }

  // Reads the clock and writes to the database, so it must run at request
  // time rather than during any prerender pass.
  await connection();

  try {
    const db = await getDb();
    const now = new Date();

    // Read first so expiry can be judged consistently with the page.
    const existing = await quotesCollection(db).findOne({ "link.token": token });
    if (!existing) return { ok: false, error: "This link is no longer valid." };
    if (existing.status === "approved" || existing.status === "rejected") {
      return { ok: false, error: "This quote has already been decided." };
    }
    if (existing.status !== "sent") {
      return { ok: false, error: "This quote is not awaiting a decision." };
    }
    if (isExpired(existing.validUntil, now)) {
      return {
        ok: false,
        error: "This quote has expired. Please ask for an updated quote.",
      };
    }

    const nowIso = now.toISOString();
    const trimmed = (reason ?? "").trim().slice(0, 500);

    // Conditional on status:"sent" so two taps of Approve cannot both win.
    const doc = await quotesCollection(db).findOneAndUpdate(
      { "link.token": token, status: "sent" },
      {
        $set: {
          status: decision,
          decidedAt: nowIso,
          updatedAt: nowIso,
          ...(decision === "rejected" && trimmed ? { rejectionReason: trimmed } : {}),
        },
        $push: {
          activity: {
            type: decision,
            label:
              decision === "approved"
                ? "Approved by customer"
                : "Rejected by customer",
            detail:
              decision === "approved"
                ? "Scope is now locked as the baseline"
                : trimmed || "No reason given",
            at: nowIso,
          },
        },
      },
      { returnDocument: "after" },
    );

    if (!doc) {
      return { ok: false, error: "This quote has already been decided." };
    }

    // Approval starts the job; rejection leaves it as it was.
    if (decision === "approved") {
      await db
        .collection("jobs")
        .updateOne(
          { reference: doc.jobReference },
          { $set: { status: "inprogress", updatedAt: nowIso } },
        );
    }

    // The dashboard must not keep showing "Awaiting approval".
    revalidatePath("/quotes");
    revalidatePath("/jobs");
    revalidatePath("/");

    return { ok: true, status: decision };
  } catch {
    return { ok: false, error: "Could not record your decision. Please try again." };
  }
}

/**
 * Mark the approval link as viewed, once.
 *
 * Kept separate from the page render so reading a quote never blocks on a
 * write, and so the activity trail shows a single "viewed" entry rather
 * than one per refresh.
 */
export async function markQuoteViewed(token: string): Promise<void> {
  if (!isValidToken(token)) return;

  // Also a request-time write: see the note in getPublicQuote().
  await connection();

  try {
    const db = await getDb();
    const now = new Date().toISOString();
    // `$ne` guard: only push the event if no "viewed" entry exists yet.
    await quotesCollection(db).updateOne(
      {
        "link.token": token,
        status: "sent",
        "activity.type": { $ne: "viewed" },
      },
      {
        $push: {
          activity: {
            type: "viewed",
            label: "Viewed by customer",
            detail: "The approval link was opened",
            at: now,
          },
        },
      },
    );
  } catch {
    // View tracking is best-effort; never break the page over it.
  }
}
