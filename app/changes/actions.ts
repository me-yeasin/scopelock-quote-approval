"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { quotesCollection, type QuoteDoc } from "@/lib/quotes";
import {
  CHANGE_KINDS,
  buildChangeLines,
  changeLineTotal,
  changeOrdersCollection,
  computeJobTotal,
  ensureChangeIndexes,
  makeChangeEvent,
  newChangeToken,
  nextChangeReference,
  syncJobTotals,
  type ChangeDoc,
  type ChangeKind,
  type ChangeStatus,
} from "@/lib/changes";
import type { ChangeOrder, ChangeOrderStatus } from "@/lib/changes-types";

/* ------------------------------------------------------------------
   Change orders — server actions for the dashboard.

   Every write that changes money does three things in one transaction:
   updates the change order, recomputes the job total from the database,
   and writes that total onto both the quote and the job. A change can
   therefore never be approved without the job total moving with it.
   ------------------------------------------------------------------ */

export type GetChangesResult =
  | { ok: true; changes: ChangeOrder[] }
  | { ok: false; error: string };

export type ChangeActionResult =
  | { ok: true; change: ChangeOrder }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type EligibleJob = {
  reference: string;
  title: string;
  quoteReference: string;
  baselineCents: number;
  currency: "GBP" | "EUR";
  customer: string;
  city: string;
};

/* ------------------------------------------------------------------
   Mapping: stored document -> UI view model
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

function mapDocToChange(doc: ChangeDoc): ChangeOrder {
  const currency = doc.currency === "EUR" ? "EUR" : "GBP";

  return {
    id: doc.reference,
    jobReference: doc.jobReference,
    quoteReference: doc.quoteReference,
    jobTitle: doc.jobTitle || "Untitled job",
    customer: doc.customer?.name ?? "",
    customerInitials: initialsFrom(doc.customer?.name || "?"),
    city: doc.site?.city ?? "",
    currency,
    status: doc.status as ChangeOrderStatus,
    kind: doc.kind as ChangeKind,
    summary: doc.summary || "Change",
    reason: doc.reason ?? "",
    lines: (doc.lines ?? []).map((line, index) => ({
      id: `${doc.reference}-${index}`,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      direction: line.direction,
    })),
    baselineCents: doc.baselineCents ?? 0,
    issuedAt: doc.issuedAt,
    validUntil: doc.validUntil,
    link: doc.link
      ? {
          // Change orders live on their own public route, /c/<token>.
          url: `/c/${doc.link.token}`,
          sentAt: doc.link.sentAt,
          sentTo: doc.link.sentTo,
          method: doc.link.method,
        }
      : undefined,
    decidedAt: doc.decidedAt,
    rejectionReason: doc.rejectionReason,
    activity: (doc.activity ?? []).map((event, index) => ({
      id: `${doc.reference}-e${index}`,
      label: event.label,
      detail: event.detail,
      at: event.at,
    })),
  };
}

/** Expire overdue orders before reading, so the list is never stale. */
async function refreshExpired() {
  const { expireStaleChanges } = await import("@/lib/changes");
  const db = await getDb();
  const expired = await expireStaleChanges(db);
  return expired;
}

/* ------------------------------------------------------------------
   Reads
   ------------------------------------------------------------------ */

export async function getChanges(): Promise<GetChangesResult> {
  try {
    const db = await getDb();
    await ensureChangeIndexes(db);

    // Cheap sweep so a customer can never approve an expired change.
    await refreshExpired();

    const docs = await changeOrdersCollection(db)
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return { ok: true, changes: docs.map(mapDocToChange) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load change orders.",
    };
  }
}

/**
 * Jobs that can take a new change order.
 *
 * Only an *approved* quote is a baseline; anything else has no agreed
 * scope to change, so those jobs are excluded rather than shown and
 * rejected later.
 */
export async function getEligibleJobs(): Promise<
  { ok: true; jobs: EligibleJob[] } | { ok: false; error: string }
> {
  try {
    const db = await getDb();
    const docs = await quotesCollection(db)
      .find({ status: "approved" })
      .sort({ decidedAt: -1 })
      .limit(100)
      .toArray();

    const jobs: EligibleJob[] = [];
    for (const quote of docs) {
      const job = await db.collection("jobs").findOne({ reference: quote.jobReference });
      const title = (job?.job?.title as string | undefined) ?? quote.title;

      jobs.push({
        reference: quote.jobReference,
        title: title || "Untitled job",
        quoteReference: quote.reference,
        baselineCents: quote.subtotalCents ?? 0,
        currency: quote.currency === "EUR" ? "EUR" : "GBP",
        customer: quote.customer?.name ?? "",
        city: quote.site?.city ?? "",
      });
    }

    return { ok: true, jobs };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load jobs.",
    };
  }
}

export async function getChange(reference: string): Promise<ChangeActionResult> {
  if (!reference) return { ok: false, error: "Missing change order reference." };

  try {
    const db = await getDb();
    const doc = await changeOrdersCollection(db).findOne({ reference });
    if (!doc) return { ok: false, error: "That change order no longer exists." };
    return { ok: true, change: mapDocToChange(doc) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the change order.",
    };
  }
}

/* ------------------------------------------------------------------
   Create
   ------------------------------------------------------------------ */

export type ChangeInput = {
  jobReference: string;
  kind: string;
  summary: string;
  reason: string;
  validUntil: string;
  lines: {
    description: string;
    quantity: string;
    unitPrice: string;
    direction: string;
  }[];
};

function toCents(value: string): number | null {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/**
 * Raise a change order against an approved job.
 *
 * The baseline is read from the quote on the server — never trusted from
 * the client — and the job total is recomputed afterwards so an already
 * approved change is carried correctly into the new figure.
 */
export async function createChange(input: ChangeInput): Promise<ChangeActionResult> {
  const fieldErrors: Record<string, string> = {};

  const jobReference = String(input.jobReference ?? "").trim();
  if (!jobReference) fieldErrors.jobReference = "Choose a job.";

  const kind = String(input.kind ?? "").trim() as ChangeKind;
  if (!CHANGE_KINDS.includes(kind)) fieldErrors.kind = "Choose a type of change.";

  const summary = String(input.summary ?? "").trim();
  if (!summary) fieldErrors.summary = "Add a one-line summary.";
  if (summary.length > 160) fieldErrors.summary = "Keep the summary under 160 characters.";

  const reason = String(input.reason ?? "").trim();
  if (!reason) fieldErrors.reason = "Explain why the change is needed.";

  const validUntil = String(input.validUntil ?? "").trim();
  if (!validUntil) fieldErrors.validUntil = "Set a date the quote stays valid until.";

  // At least one priced line, each with a description and a positive price.
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const parsed: {
    description: string;
    quantity: number;
    unitPriceCents: number;
    direction: "add" | "credit";
  }[] = [];

  rawLines.forEach((line, index) => {
    const description = String(line.description ?? "").trim();
    const quantity = Number(String(line.quantity ?? "").replace(/[^0-9.]/g, ""));
    const unitPriceCents = toCents(String(line.unitPrice ?? ""));
    const direction = line.direction === "credit" ? "credit" : "add";

    if (!description && unitPriceCents === null) return; // ignore blank rows
    if (!description) {
      fieldErrors[`line-${index}`] = "Describe this item.";
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      fieldErrors[`line-${index}`] = "Quantity must be more than zero.";
      return;
    }
    if (unitPriceCents === null) {
      fieldErrors[`line-${index}`] = "Enter a price for this item.";
      return;
    }

    parsed.push({ description, quantity, unitPriceCents, direction });
  });

  if (parsed.length === 0 && Object.keys(fieldErrors).length === 0) {
    fieldErrors.lines = "Add at least one priced item.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    const db = await getDb();
    await ensureChangeIndexes(db);

    // The job must exist and carry an approved quote to serve as baseline.
    const job = await db.collection("jobs").findOne({ reference: jobReference });
    if (!job) return { ok: false, error: "That job no longer exists." };

    const quote = await quotesCollection(db).findOne({
      jobReference,
      status: "approved",
    });
    if (!quote) {
      return {
        ok: false,
        error: "That job has no approved quote, so there is no agreed scope to change.",
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const lines = buildChangeLines(parsed);
    const netCents = lines.reduce((sum, line) => sum + line.totalCents, 0);

    const _id = new ObjectId();
    let reference = "";

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        reference = await nextChangeReference(db, now);

        const doc: ChangeDoc = {
          _id,
          reference,
          jobReference,
          jobId: job._id,
          quoteReference: quote.reference,
          // A new order is a draft: nothing is billable and the customer
          // has not seen it until it is sent.
          status: "draft",
          kind,
          currency: quote.currency === "EUR" ? "EUR" : "GBP",
          jobTitle: (job.job?.title as string | undefined) ?? quote.title,
          customer: {
            name: quote.customer?.name ?? "",
            email: quote.customer?.email ?? "",
            phone: quote.customer?.phone ?? "",
          },
          site: { city: quote.site?.city ?? "" },
          summary,
          reason,
          lines,
          // Frozen snapshot of what the customer already agreed to.
          baselineCents: quote.subtotalCents ?? 0,
          netCents,
          issuedAt: nowIso,
          validUntil,
          activity: [
            makeChangeEvent(
              "created",
              "Change order raised",
              `Measured against ${quote.reference}`,
              nowIso,
            ),
          ],
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        await changeOrdersCollection(db).insertOne(doc, { session });

        // A draft is not billable, but the quote's pending figure should
        // still reflect it so the dashboard shows the true exposure.
        const breakdown = await computeJobTotal(
          db,
          jobReference,
          quote.subtotalCents ?? 0,
          session,
        );
        await syncJobTotals(db, jobReference, breakdown, nowIso, session);
      });
    } finally {
      await session.endSession();
    }

    const saved = await changeOrdersCollection(db).findOne({ _id });
    if (!saved) return { ok: false, error: "The change order could not be saved." };

    revalidatePath("/changes");
    revalidatePath("/quotes");
    revalidatePath("/jobs");
    revalidatePath("/");

    return { ok: true, change: mapDocToChange(saved) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the change order.",
    };
  }
}

/* ------------------------------------------------------------------
   Send — generates the approval link
   ------------------------------------------------------------------ */

/**
 * Send a change order for approval.
 *
 * Like `sendQuote`, this is what the single "Copy link" button calls:
 * it mints the token, flips draft -> sent, and returns the copyable URL.
 * Re-sending an already-sent order reuses the existing token so a
 * customer holding the old link is not stranded.
 */
export async function sendChange(
  reference: string,
  method: "email" | "sms" | "copy" = "copy",
  sentTo = "",
): Promise<ChangeActionResult> {
  if (!reference) return { ok: false, error: "Missing change order reference." };

  try {
    const db = await getDb();
    const nowIso = new Date().toISOString();

    const existing = await changeOrdersCollection(db).findOne({ reference });
    if (!existing) return { ok: false, error: "That change order no longer exists." };

    if (existing.status === "approved" || existing.status === "rejected") {
      return { ok: false, error: "This change order has already been decided." };
    }
    if (existing.status === "expired" || existing.status === "withdrawn") {
      return { ok: false, error: "This change order is closed and cannot be sent." };
    }

    const firstSend = !existing.link;

    const doc = await changeOrdersCollection(db).findOneAndUpdate(
      { reference, status: { $in: ["draft", "sent"] } },
      {
        $set: {
          status: "sent",
          "link.token": existing.link?.token ?? newChangeToken(),
          "link.sentAt": nowIso,
          "link.sentTo": sentTo,
          "link.method": method,
          updatedAt: nowIso,
        },
        ...(firstSend
          ? {
              $push: {
                activity: makeChangeEvent(
                  "sent",
                  "Sent to customer",
                  "Approval link copied",
                  nowIso,
                ),
              },
            }
          : {}),
      },
      { returnDocument: "after" },
    );

    if (!doc) return { ok: false, error: "This change order can no longer be sent." };

    // The pending figure on the quote must reflect the newly sent order.
    const quote = await quotesCollection(db).findOne({ jobReference: doc.jobReference });
    if (quote) {
      const breakdown = await computeJobTotal(
        db,
        doc.jobReference,
        quote.subtotalCents ?? 0,
      );
      await syncJobTotals(db, doc.jobReference, breakdown, nowIso);
    }

    revalidatePath("/changes");
    revalidatePath("/quotes");
    revalidatePath("/jobs");

    return { ok: true, change: mapDocToChange(doc) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not send the change order.",
    };
  }
}

/* ------------------------------------------------------------------
   Decision
   ------------------------------------------------------------------ */

/**
 * Record an approval or rejection.
 *
 * The update is guarded on `status: "sent"`, so a double tap cannot
 * approve twice and an expired order cannot be approved. Approval and
 * the job-total recompute happen in one transaction: the total can never
 * drift from the changes that justify it.
 */
async function decide(
  filter: Record<string, unknown>,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<ChangeActionResult> {
  try {
    const db = await getDb();
    await ensureChangeIndexes(db);

    const now = new Date();
    const nowIso = now.toISOString();
    const trimmed = (reason ?? "").trim().slice(0, 500);

    const existing = await changeOrdersCollection(db).findOne(filter);
    if (!existing) return { ok: false, error: "This change order no longer exists." };
    if (existing.status === "approved" || existing.status === "rejected") {
      return { ok: false, error: "This change order has already been decided." };
    }
    if (existing.status !== "sent") {
      return { ok: false, error: "This change order is not awaiting a decision." };
    }

    const quote = await quotesCollection(db).findOne({ jobReference: existing.jobReference });
    const baseline = quote?.subtotalCents ?? existing.baselineCents ?? 0;

    let updated: ChangeDoc | null = null;

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        updated = await changeOrdersCollection(db).findOneAndUpdate(
          { ...filter, status: "sent" },
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
              activity: makeChangeEvent(
                decision,
                decision === "approved"
                  ? "Approved by customer"
                  : "Rejected by customer",
                decision === "approved"
                  ? "Rolled into the job total"
                  : trimmed || "No reason given",
                nowIso,
              ),
            },
          },
          { returnDocument: "after", session },
        );

        if (!updated) {
          throw new Error("This change order has already been decided.");
        }

        // Recompute from the database rather than adjusting by a delta, so
        // the stored total can never accumulate rounding or duplicate adds.
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

    if (!updated) return { ok: false, error: "This change order has already been decided." };

    revalidatePath("/changes");
    revalidatePath("/quotes");
    revalidatePath("/jobs");
    revalidatePath("/");

    return { ok: true, change: mapDocToChange(updated) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not record the decision.",
    };
  }
}

export async function decideChange(
  reference: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<ChangeActionResult> {
  if (!reference) return { ok: false, error: "Missing change order reference." };
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "Invalid decision." };
  }
  return decide({ reference }, decision, reason);
}

/* ------------------------------------------------------------------
   Withdraw — close an order that was raised in error
   ------------------------------------------------------------------ */

/**
 * Withdraw a draft or sent change order.
 *
 * Withdrawal is not rejection: the customer never answered. It closes the
 * order for good, drops it out of the pending figure, and leaves the job
 * total untouched. Approved orders cannot be withdrawn — a credit is the
 * correct tool for undoing agreed work.
 */
export async function withdrawChange(reference: string): Promise<ChangeActionResult> {
  if (!reference) return { ok: false, error: "Missing change order reference." };

  try {
    const db = await getDb();
    const nowIso = new Date().toISOString();

    const existing = await changeOrdersCollection(db).findOne({ reference });
    if (!existing) return { ok: false, error: "That change order no longer exists." };
    if (existing.status === "approved") {
      return {
        ok: false,
        error: "Approved changes cannot be withdrawn. Raise a credit instead.",
      };
    }
    if (existing.status === "rejected" || existing.status === "withdrawn") {
      return { ok: false, error: "This change order is already closed." };
    }

    const quote = await quotesCollection(db).findOne({ jobReference: existing.jobReference });
    const baseline = quote?.subtotalCents ?? existing.baselineCents ?? 0;

    let updated: ChangeDoc | null = null;

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        updated = await changeOrdersCollection(db).findOneAndUpdate(
          { reference, status: { $in: ["draft", "sent", "expired"] } },
          {
            $set: { status: "withdrawn", updatedAt: nowIso },
            $push: {
              activity: makeChangeEvent(
                "withdrawn",
                "Withdrawn",
                "Closed without a customer decision",
                nowIso,
              ),
            },
          },
          { returnDocument: "after", session },
        );

        if (!updated) throw new Error("This change order is already closed.");

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

    if (!updated) return { ok: false, error: "This change order is already closed." };

    revalidatePath("/changes");
    revalidatePath("/quotes");
    revalidatePath("/jobs");

    return { ok: true, change: mapDocToChange(updated) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not withdraw the change order.",
    };
  }
}

/* ------------------------------------------------------------------
   Delete a draft
   ------------------------------------------------------------------ */

/**
 * Delete a change order that has never left the workspace.
 *
 * Only drafts can be deleted. Anything sent has been seen by the customer
 * and is part of the record, so it is withdrawn instead of erased —
 * deleting a numbered document that a customer may be holding a link to
 * would break the audit trail.
 */
export async function deleteChange(reference: string): Promise<ChangeActionResult> {
  if (!reference) return { ok: false, error: "Missing change order reference." };

  try {
    const db = await getDb();

    const existing = await changeOrdersCollection(db).findOne({ reference });
    if (!existing) return { ok: false, error: "That change order no longer exists." };
    if (existing.status !== "draft") {
      return {
        ok: false,
        error: "Only drafts can be deleted. Withdraw this one instead to keep the record.",
      };
    }

    const quote = await quotesCollection(db).findOne({ jobReference: existing.jobReference });
    const baseline = quote?.subtotalCents ?? existing.baselineCents ?? 0;
    const nowIso = new Date().toISOString();

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await changeOrdersCollection(db).deleteOne(
          { reference, status: "draft" },
          { session },
        );
        if (result.deletedCount === 0) throw new Error("That change order is no longer a draft.");

        const breakdown = await computeJobTotal(
          db,
          existing.jobReference,
          baseline,
          session,
        );
        await syncJobTotals(db, existing.jobReference, breakdown, nowIso, session);
      });
    } finally {
      await session.endSession();
    }

    revalidatePath("/changes");
    revalidatePath("/quotes");
    revalidatePath("/jobs");

    return { ok: true, change: mapDocToChange(existing) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete the change order.",
    };
  }
}

export async function expireChanges(): Promise<{ ok: true; expired: number } | { ok: false; error: string }> {
  try {
    const expired = await refreshExpired();
    if (expired > 0) revalidatePath("/changes");
    return { ok: true, expired };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not expire change orders.",
    };
  }
}
