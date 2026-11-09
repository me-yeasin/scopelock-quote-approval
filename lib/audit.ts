import type { Db } from "mongodb";

import { changeOrdersCollection } from "./changes";
import { invoicesCollection } from "./invoices";
import { quotesCollection } from "./quotes";
import { requireOwnerId } from "./ownership";

/* ------------------------------------------------------------------
   Audit log — the read side.

   Nothing here writes. Every quote, change order and invoice already keeps
   its own `activity` array, written at the moment of the event by whichever
   action caused it. This module's whole job is to merge those arrays into a
   single chronological timeline and classify them.

   That shape is deliberate: the log is *derived from the documents*, not a
   separate append-only store. It cannot drift from the truth, because it is
   a projection of the truth. The cost is that events are only as good as
   what the actions recorded, so `classify()` below is tolerant of unknown
   types rather than dropping them — an unrecognised event still appears,
   just without a special tone.

   What the log is for: proving what a customer agreed to, and when. So the
   classifier ranks signal — a customer decision outranks a document being
   opened.
   ------------------------------------------------------------------ */

export type {
  AuditEntry,
  AuditQuery,
  AuditSource,
  AuditSummary,
  AuditTone,
} from "./audit-shared";
export { AUDIT_FILTERS, SOURCE_LABEL } from "./audit-shared";

import type {
  AuditEntry,
  AuditQuery,
  AuditSource,
  AuditSummary,
  AuditTone,
} from "./audit-shared";

/* ------------------------------------------------------------------
   Classification

   Maps a stored event onto a tone. `source` matters because the same type
   word means different things on different documents: an "approved" change
   order moves the price, while an "approved" quote establishes the
   baseline — both are agreements, but only one is a price movement.

   The amount passed in lets the classifier distinguish an increase from a
   credit, which changes the icon and the colour.
   ------------------------------------------------------------------ */

export function classify(
  source: AuditSource,
  type: string,
  amountCents: number | undefined,
): AuditTone {
  switch (type) {
    case "approved":
      // A change order approval always moves the job total — that is the
      // more useful reading of the event. A quote approval sets the
      // baseline, which is an agreement rather than a movement.
      return source === "change" ? "moved" : "agree";
    case "rejected":
      return "decline";
    case "sent":
    case "issued":
      return "sent";
    case "viewed":
      return "seen";
    case "created":
      return "created";
    case "withdrawn":
    case "voided":
      return "other";
    case "paid":
      return "agree";
    case "edited":
    case "noted":
      return "other";
    default:
      // Unknown event: still show it, but keep it visually neutral rather
      // than guessing a tone that might misrepresent what happened.
      return amountCents ? "moved" : "other";
  }
}

/* ------------------------------------------------------------------
   Building the timeline
   ------------------------------------------------------------------ */

type ActivityLike = {
  type?: string;
  label?: string;
  detail?: string;
  at?: string;
};

/** Read the job total movement caused by an approved change order. */
function changeAmount(change: {
  status?: string;
  netCents?: unknown;
  activity?: ActivityLike[];
}, type: string) {
  // Only an approval changes the money. A "sent" event carries no amount.
  if (type !== "approved") return undefined;
  const net = Math.round(Number(change.netCents) || 0);
  return net === 0 ? undefined : net;
}

/**
 * The largest number of events the screen will render.
 *
 * A hard cap keeps the page bounded as history grows: the audit log is for
 * answering a question about recent work, not for archiving years. The UI
 * states the cap so the list is never mistaken for the complete history.
 */
export const AUDIT_PAGE_SIZE = 300;

function matchesQuery(entry: AuditEntry, needle: string) {
  if (!needle) return true;
  return `${entry.label} ${entry.detail} ${entry.subject} ${entry.documentReference} ${entry.jobReference} ${entry.jobTitle} ${entry.customer}`
    .toLowerCase()
    .includes(needle);
}

/**
 * Merge every document's activity into one timeline.
 *
 * Reads are done in parallel and projected to only the fields the log needs,
 * because activity arrays on large documents are otherwise expensive to pull
 * whole. Sorting is newest-first and stable by timestamp.
 */
export async function getAuditEntries(query: AuditQuery = {}): Promise<AuditEntry[]> {
  const db: Db = await (await import("./db")).getDb();

  const jobFilter = query.jobReference ? { jobReference: query.jobReference } : {};
  const sinceFilter = query.since ? { updatedAt: { $gte: query.since } } : {};
  const filter = { ...jobFilter, ...sinceFilter, ownerId: await requireOwnerId() };

  const [quotes, changes, invoices] = await Promise.all([
    quotesCollection(db)
      .find(filter, {
        projection: {
          reference: 1,
          jobReference: 1,
          title: 1,
          customer: 1,
          currency: 1,
          status: 1,
          activity: 1,
          subtotalCents: 1,
          netCents: 1,
        },
      })
      .toArray(),
    changeOrdersCollection(db)
      .find(filter, {
        projection: {
          reference: 1,
          jobReference: 1,
          jobTitle: 1,
          customer: 1,
          currency: 1,
          status: 1,
          summary: 1,
          netCents: 1,
          activity: 1,
        },
      })
      .toArray(),
    invoicesCollection(db)
      .find(filter, {
        projection: {
          reference: 1,
          jobReference: 1,
          jobTitle: 1,
          customer: 1,
          currency: 1,
          status: 1,
          issuedSnapshotCents: 1,
          activity: 1,
        },
      })
      .toArray(),
  ]);

  const entries: AuditEntry[] = [];

  const push = (
    source: AuditSource,
    doc: {
      reference?: string;
      jobReference?: string;
      currency?: string;
    },
    meta: { jobTitle: string; customer: string; subject: string },
    activity: ActivityLike[] | undefined,
    amount: (type: string) => number | undefined,
  ) => {
    for (const event of activity ?? []) {
      const at = typeof event.at === "string" ? event.at : "";
      if (!at) continue;

      const type = String(event.type ?? "other");
      const amountCents = amount(type);

      entries.push({
        id: `${source}:${doc.reference}:${type}:${at}`,
        at,
        source,
        documentReference: String(doc.reference ?? ""),
        jobReference: String(doc.jobReference ?? ""),
        jobTitle: meta.jobTitle,
        customer: meta.customer,
        label: String(event.label ?? type),
        detail: String(event.detail ?? ""),
        // What the document was *about* — a change order's summary, a quote's
        // title. Searching the log for "valve" must find the change order that
        // added one, even though the event text never says "valve".
        subject: meta.subject,
        tone: classify(source, type, amountCents),
        amountCents,
        currency: String(doc.currency ?? "GBP").toUpperCase(),
        type,
      });
    }
  };

  for (const quote of quotes) {
    push(
      "quote",
      quote as never,
      {
        jobTitle: String(quote.title ?? ""),
        customer: String(quote.customer?.name ?? ""),
        subject: String(quote.title ?? ""),
      },
      quote.activity as ActivityLike[],
      // An approval establishes the agreed baseline, so it is the amount the
      // job was agreed at rather than a movement.
      (type) => (type === "approved" ? Math.round(Number(quote.subtotalCents) || 0) : undefined),
    );
  }

  for (const change of changes) {
    push(
      "change",
      change as never,
      {
        jobTitle: String(change.jobTitle ?? ""),
        customer: String(change.customer?.name ?? ""),
        subject: String(change.summary ?? ""),
      },
      change.activity as ActivityLike[],
      (type) => changeAmount(change as never, type),
    );
  }

  for (const invoice of invoices) {
    push(
      "invoice",
      invoice as never,
      {
        jobTitle: String(invoice.jobTitle ?? ""),
        customer: String(invoice.customer?.name ?? ""),
        subject: "",
      },
      invoice.activity as ActivityLike[],
      // A payment settles money but does not *move the price*, so it carries
      // no amount here. Showing "+£2,300" beside a payment would read as a
      // price increase, which is the opposite of what happened. The invoice
      // list already shows the settled figure.
      () => undefined,
    );
  }

  const needle = (query.query ?? "").trim().toLowerCase();
  const sourceFilter = query.source && query.source !== "all" ? query.source : null;

  return entries
    .filter((entry) => {
      if (sourceFilter && entry.source !== sourceFilter) return false;
      // Tone filtering runs after classification because tone is derived.
      if (query.tone && query.tone !== "all" && entry.tone !== query.tone) return false;
      return matchesQuery(entry, needle);
    })
    .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1))
    .slice(0, query.limit ?? AUDIT_PAGE_SIZE);
}

/* ------------------------------------------------------------------
   Summary figures

   Computed from the same entries the list renders, so the numbers above the
   timeline can never disagree with the rows beneath it.
   ------------------------------------------------------------------ */

export function summarise(entries: AuditEntry[]): AuditSummary {
  let agreed = 0;
  let declined = 0;
  let moved = 0;
  let movedCents = 0;

  for (const entry of entries) {
    if (entry.tone === "agree") agreed += 1;
    else if (entry.tone === "decline") declined += 1;
    else if (entry.tone === "moved") {
      moved += 1;
      // Only change-order approvals are price movements; a quote approval
      // also carries an amount but does not move the total.
      if (entry.source === "change" && entry.amountCents) movedCents += entry.amountCents;
    }
  }

  return {
    total: entries.length,
    agreed,
    declined,
    moved,
    movedCents,
    jobs: new Set(entries.map((entry) => entry.jobReference).filter(Boolean)).size,
  };
}

/* ------------------------------------------------------------------
   Job options for the filter
   ------------------------------------------------------------------ */

/** Every job that appears in the log, for the "this job only" filter. */
export async function getAuditJobs(): Promise<{ jobReference: string; jobTitle: string }[]> {
  const db = await import("./db").then((mod) => mod.getDb());

  const ownerId = await requireOwnerId();

  const [fromQuotes, fromChanges] = await Promise.all([
    quotesCollection(db)
      .find({ ownerId }, { projection: { jobReference: 1, title: 1 } })
      .toArray(),
    changeOrdersCollection(db)
      .find({ ownerId }, { projection: { jobReference: 1, jobTitle: 1 } })
      .toArray(),
  ]);

  const seen = new Map<string, string>();
  for (const quote of fromQuotes) {
    const ref = String(quote.jobReference ?? "");
    if (ref) seen.set(ref, String(quote.title ?? ""));
  }
  for (const change of fromChanges) {
    const ref = String(change.jobReference ?? "");
    if (ref && !seen.get(ref)) seen.set(ref, String(change.jobTitle ?? ""));
  }

  return [...seen.entries()]
    .map(([jobReference, jobTitle]) => ({ jobReference, jobTitle }))
    .sort((a, b) => (a.jobReference < b.jobReference ? 1 : -1));
}
