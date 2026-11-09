"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import type { Job, StatusKey } from "@/lib/jobs-types";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export type GetJobsResult =
  | { ok: true; jobs: Job[] }
  | { ok: false; error: string };

/** Field-level errors so the drawer can point at the offending input. */
export type JobFieldErrors = {
  title?: string;
  customer?: string;
  city?: string;
  status?: string;
};

export type UpdateJobResult =
  | { ok: true; job: Job }
  | { ok: false; error: string; fields?: JobFieldErrors; conflict?: boolean };

export type DeleteJobResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string; notFound?: boolean };

export type JobPatch = {
  title: string;
  customer: string;
  city: string;
  status: StatusKey;
  /** ISO timestamp the drawer loaded the job with — used for a lost-update check. */
  expectedUpdatedAt?: string;
};

/* ------------------------------------------------------------------
   Limits — mirrored from the DB schema so both create and update agree
   ------------------------------------------------------------------ */
const MAX_TITLE = 120;
const MAX_CUSTOMER = 120;
const MAX_CITY = 80;

const KNOWN_STATUSES: StatusKey[] = ["approved", "awaiting", "inprogress", "draft"];

function normalizeStatus(value: unknown): StatusKey {
  return KNOWN_STATUSES.includes(value as StatusKey) ? (value as StatusKey) : "draft";
}

/* ------------------------------------------------------------------
   Helpers — map a MongoDB document to the UI `Job` shape
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

function formatMoney(cents: number, currency: string) {
  const symbol = currency === "EUR" ? "€" : "£";
  const value = (Number(cents) || 0) / 100;
  const text = value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${text}`;
}

function relativeTime(iso: unknown) {
  const then = typeof iso === "string" ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(then)) return "—";

  const diff = Math.max(0, Date.now() - then);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;

  return new Date(then).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

type JobItem = { totalCents?: unknown };

type JobDoc = {
  _id?: unknown;
  reference?: unknown;
  status?: unknown;
  currency?: unknown;
  customer?: { name?: unknown };
  site?: { city?: unknown };
  job?: { title?: unknown };
  items?: JobItem[];
  totalCents?: unknown;
  updatedAt?: unknown;
};

function sumItems(doc: JobDoc) {
  if (!Array.isArray(doc.items) || doc.items.length === 0) return null;
  const total = doc.items.reduce((sum, item) => {
    const cents = typeof item?.totalCents === "number" ? item.totalCents : 0;
    return sum + cents;
  }, 0);
  return Number.isFinite(total) ? total : null;
}

function mapDocToJob(doc: JobDoc): Job {
  const reference = typeof doc.reference === "string" ? doc.reference : "";
  const customer = typeof doc.customer?.name === "string" ? doc.customer.name : "";
  const totalCents = typeof doc.totalCents === "number" ? doc.totalCents : 0;
  const currency = typeof doc.currency === "string" ? doc.currency : "GBP";
  const objectId = doc._id instanceof ObjectId ? doc._id.toHexString() : undefined;
  const updatedAt = typeof doc.updatedAt === "string" ? doc.updatedAt : undefined;

  // Quote is the agreed scope (sum of line items); total is quote + approved
  // changes. Change orders are not modelled yet, so the two match for now —
  // but they are computed separately so the invoice maths lives in one place.
  const quoteCents = sumItems(doc) ?? totalCents;
  const changedCents = totalCents - quoteCents;

  return {
    id: reference,
    objectId,
    updatedAt,
    title: typeof doc.job?.title === "string" ? doc.job.title : "Untitled job",
    city: typeof doc.site?.city === "string" ? doc.site.city : "—",
    customer,
    initials: initialsFrom(customer || "?"),
    quote: formatMoney(quoteCents, currency),
    change:
      changedCents === 0
        ? "—"
        : `${changedCents > 0 ? "+" : "−"}${formatMoney(Math.abs(changedCents), currency)}`,
    changeTone: changedCents === 0 ? "none" : changedCents > 0 ? "up" : "down",
    total: formatMoney(totalCents, currency),
    status: normalizeStatus(doc.status),
    updated: relativeTime(doc.updatedAt),
  };
}

/**
 * A reference alone is not guaranteed unique (it is derived from the ObjectId
 * suffix), so mutations match on the reference *and*, when it is known, the
 * document `_id`. Job ids reach the client as references, so accept either an
 * ObjectId hex string or a reference.
 */
function matchFilter(jobId: string) {
  if (ObjectId.isValid(jobId) && jobId.length === 24) {
    return { _id: new ObjectId(jobId) };
  }
  return { reference: jobId };
}

/* ------------------------------------------------------------------
   Validation — shared by update so client and server agree
   ------------------------------------------------------------------ */

function validate(patch: JobPatch): JobFieldErrors {
  const fields: JobFieldErrors = {};
  const title = typeof patch.title === "string" ? patch.title.trim() : "";
  const customer = typeof patch.customer === "string" ? patch.customer.trim() : "";
  const city = typeof patch.city === "string" ? patch.city.trim() : "";

  if (!title) fields.title = "Give this job a short title.";
  else if (title.length > MAX_TITLE) fields.title = `Keep the title under ${MAX_TITLE} characters.`;

  if (!customer) fields.customer = "Enter the customer's name.";
  else if (customer.length > MAX_CUSTOMER)
    fields.customer = `Keep the name under ${MAX_CUSTOMER} characters.`;

  if (city.length > MAX_CITY) fields.city = `Keep the city under ${MAX_CITY} characters.`;

  if (!KNOWN_STATUSES.includes(patch.status)) fields.status = "Choose a valid status.";

  return fields;
}

/* ------------------------------------------------------------------
   Actions
   ------------------------------------------------------------------ */

/** Fetch all jobs, newest first. */
export async function getJobs(): Promise<GetJobsResult> {
  try {
    const db = await getDb();
    const docs = await db
      .collection("jobs")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const jobs = docs.map((doc) => mapDocToJob(doc as unknown as JobDoc));
    return { ok: true, jobs };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load jobs.",
    };
  }
}

/**
 * Update the editable fields of a job.
 *
 * Matching happens on `_id`/`reference`. When the drawer supplies the
 * `updatedAt` it loaded, the write is conditional on the stored value still
 * matching; a mismatch means someone else edited the job meanwhile, and we
 * report a conflict instead of silently overwriting their change.
 */
export async function updateJob(jobId: string, patch: JobPatch): Promise<UpdateJobResult> {
  if (!jobId) return { ok: false, error: "Missing job reference." };

  const fields = validate(patch);
  if (Object.keys(fields).length > 0) {
    return { ok: false, error: "Check the highlighted fields.", fields };
  }

  const filter: Record<string, unknown> = matchFilter(jobId);
  if (patch.expectedUpdatedAt) {
    filter.updatedAt = patch.expectedUpdatedAt;
  }

  try {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    const result = await db.collection("jobs").findOneAndUpdate(
      filter,
      {
        $set: {
          "job.title": patch.title.trim(),
          "customer.name": patch.customer.trim(),
          "site.city": patch.city.trim(),
          status: patch.status,
          updatedAt,
        },
      },
      { returnDocument: "after" },
    );

    if (!result) {
      // Distinguish "gone" from "changed underneath us" so the UI can react.
      if (patch.expectedUpdatedAt) {
        const stillExists = await db.collection("jobs").findOne(matchFilter(jobId));
        if (stillExists) {
          return {
            ok: false,
            conflict: true,
            error: "This job changed elsewhere. Close and reopen it to see the latest version.",
          };
        }
      }
      return { ok: false, error: "That job could no longer be found." };
    }

    revalidatePath("/jobs");
    revalidatePath("/");

    return { ok: true, job: mapDocToJob(result as unknown as JobDoc) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update the job.",
    };
  }
}

/** Delete a job by its ObjectId or reference. */
export async function deleteJob(jobId: string): Promise<DeleteJobResult> {
  if (!jobId) return { ok: false, error: "Missing job reference." };

  try {
    const db = await getDb();
    const result = await db.collection("jobs").deleteOne(matchFilter(jobId));

    if (result.deletedCount === 0) {
      return { ok: false, notFound: true, error: "That job was already deleted." };
    }

    revalidatePath("/jobs");
    revalidatePath("/");

    return { ok: true, jobId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete the job.",
    };
  }
}
