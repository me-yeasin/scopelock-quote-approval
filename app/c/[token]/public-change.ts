"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { quotesCollection } from "@/lib/quotes";
import {
  changeOrdersCollection,
  computeJobTotal,
  syncJobTotals,
  type ChangeDoc,
  type ChangeKind,
} from "@/lib/changes";

/* ------------------------------------------------------------------
   Public (customer-facing) change order access.

   Same rules as the quote page in /q: lookup is by opaque token only,
   drafts are invisible even to a token holder, expiry is derived at read
   time, and only the fields the customer needs are returned.
   ------------------------------------------------------------------ */

export type PublicChange = {
  reference: string;
  jobTitle: string;
  customerName: string;
  city: string;
  currency: "GBP" | "EUR";
  status: string;
  kind: ChangeKind;
  summary: string;
  reason: string;
  lines: {
    description: string;
    quantity: number;
    unitPriceCents: number;
    direction: "add" | "credit";
  }[];
  baselineCents: number;
  netCents: number;
  newTotalCents: number;
  issuedAt: string;
  validUntil: string;
  decidedAt?: string;
  rejectionReason?: string;
};

/**
 * Load the two figures the customer actually needs: what the job total was
 * before this change, and what it will be after.
 *
 * `doc.baselineCents` is a frozen snapshot taken when the change was
 * raised, so it is correct only for the first change on a job. Once other
 * changes are approved it goes stale, and showing it would understate the
 * customer's real total. The live figures come from the quote (baseline +
 * approved changes) and are used whenever they are available.
 */
async function liveTotals(
  db: import("mongodb").Db,
  doc: ChangeDoc,
): Promise<{ baselineCents: number; newTotalCents: number }> {
  const quote = await quotesCollection(db).findOne({ jobReference: doc.jobReference });

  if (!quote) {
    return {
      baselineCents: doc.baselineCents ?? 0,
      newTotalCents: (doc.baselineCents ?? 0) + (doc.netCents ?? 0),
    };
  }

  const quoteTotal = quote.subtotalCents ?? 0;
  const otherApproved = quote.approvedChangesCents ?? 0;

  // This change is already counted in `approvedChangesCents` once decided,
  // so back it out to get the "before" figure.
  const alreadyCounted = doc.status === "approved" ? (doc.netCents ?? 0) : 0;
  const baselineCents = quoteTotal + otherApproved - alreadyCounted;

  return { baselineCents, newTotalCents: baselineCents + (doc.netCents ?? 0) };
}

export type PublicChangeResult =
  | { ok: true; change: PublicChange }
  | { ok: false; reason: "not-found" | "not-sent" | "error" };

const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

function isValidToken(token: string | undefined | null): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

function isExpired(validUntil: string, now: Date): boolean {
  if (!validUntil) return false;
  const end = new Date(validUntil);
  if (Number.isNaN(end.getTime())) return false;

  const endOfDay = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
    23,
    59,
    59,
    999,
  );
  return now.getTime() > endOfDay;
}

function toPublic(
  doc: ChangeDoc,
  now: Date,
  totals: { baselineCents: number; newTotalCents: number },
): PublicChange {
  const expired = doc.status === "sent" && isExpired(doc.validUntil, now);

  return {
    reference: doc.reference,
    jobTitle: doc.jobTitle || "Your job",
    customerName: doc.customer?.name ?? "",
    city: doc.site?.city ?? "",
    currency: doc.currency === "EUR" ? "EUR" : "GBP",
    status: expired ? "expired" : doc.status,
    kind: doc.kind,
    summary: doc.summary,
    reason: doc.reason,
    lines: (doc.lines ?? []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      direction: line.direction,
    })),
    baselineCents: totals.baselineCents,
    netCents: doc.netCents ?? 0,
    newTotalCents: totals.newTotalCents,
    issuedAt: doc.issuedAt,
    validUntil: doc.validUntil,
    decidedAt: doc.decidedAt,
    rejectionReason: doc.rejectionReason,
  };
}

export async function getPublicChange(token: string): Promise<PublicChangeResult> {
  if (!isValidToken(token)) return { ok: false, reason: "not-found" };

  try {
    const db = await getDb();
    const doc = await changeOrdersCollection(db).findOne({ "link.token": token });
    if (!doc) return { ok: false, reason: "not-found" };

    // A draft has never been sent; a rotated token no longer matches.
    if (doc.status === "draft" || doc.status === "withdrawn") {
      return { ok: false, reason: "not-sent" };
    }

    const totals = await liveTotals(db, doc);
    return { ok: true, change: toPublic(doc, new Date(), totals) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/* ------------------------------------------------------------------
   Customer decision
   ------------------------------------------------------------------ */

export type PublicDecisionResult =
  | { ok: true; status: "approved" | "rejected" }
  | { ok: false; error: string };

/**
 * Record the customer's decision on a change order.
 *
 * The token is the credential and the write is guarded on `status:"sent"`,
 * so the link cannot approve twice and an expired order cannot be
 * approved. Approving recomputes the job total in the same transaction.
 */
export async function decideChangeByToken(
  token: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<PublicDecisionResult> {
  if (!isValidToken(token)) return { ok: false, error: "This link is not valid." };
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "Invalid decision." };
  }

  try {
    const db = await getDb();
    const now = new Date();
    const nowIso = now.toISOString();
    const trimmed = (reason ?? "").trim().slice(0, 500);

    const existing = await changeOrdersCollection(db).findOne({ "link.token": token });
    if (!existing) return { ok: false, error: "This link is no longer valid." };
    if (existing.status === "approved" || existing.status === "rejected") {
      return { ok: false, error: "This change has already been decided." };
    }
    if (existing.status !== "sent") {
      return { ok: false, error: "This change is not awaiting a decision." };
    }
    if (isExpired(existing.validUntil, now)) {
      return { ok: false, error: "This change has expired. Please ask for an updated one." };
    }

    const quote = await quotesCollection(db).findOne({
      jobReference: existing.jobReference,
    });
    const baseline = quote?.subtotalCents ?? existing.baselineCents ?? 0;

    let updated: ChangeDoc | null = null;

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        updated = await changeOrdersCollection(db).findOneAndUpdate(
          { "link.token": token, status: "sent" },
          {
            $set: {
              status: decision,
              decidedAt: nowIso,
              updatedAt: nowIso,
              ...(decision === "rejected" && trimmed
                ? { rejectionReason: trimmed }
                : {}),
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
                    ? "Rolled into the job total"
                    : trimmed || "No reason given",
                at: nowIso,
              },
            },
          },
          { returnDocument: "after", session },
        );

        if (!updated) throw new Error("This change has already been decided.");

        const breakdown = await computeJobTotal(
          db,
          updated.jobReference,
          baseline,
          session,
        );
        await syncJobTotals(db, updated.jobReference, breakdown, nowIso, session);
      });
    } finally {
      await session.endSession();
    }

    if (!updated) return { ok: false, error: "This change has already been decided." };

    revalidatePath("/changes");
    revalidatePath("/quotes");
    revalidatePath("/jobs");
    revalidatePath("/");

    return { ok: true, status: decision };
  } catch {
    return { ok: false, error: "Could not record your decision. Please try again." };
  }
}

/** Mark the link viewed, once — mirrors markQuoteViewed. */
export async function markChangeViewed(token: string): Promise<void> {
  if (!isValidToken(token)) return;

  try {
    const db = await getDb();
    await changeOrdersCollection(db).updateOne(
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
            at: new Date().toISOString(),
          },
        },
      },
    );
  } catch {
    // Best effort: never break the page over view tracking.
  }
}
