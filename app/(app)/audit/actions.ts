"use server";

import {
  AUDIT_PAGE_SIZE,
  getAuditEntries,
  getAuditJobs,
  summarise,
  type AuditEntry,
  type AuditQuery,
  type AuditSource,
  type AuditSummary,
  type AuditTone,
} from "@/lib/audit";

/* ------------------------------------------------------------------
   Audit log server actions.

   The log is read-only by design — there is no mutation surface at all.
   These actions exist so the page can re-query with filters without
   shipping the whole timeline to the client, and so the same functions can
   be reused by any future export.
   ------------------------------------------------------------------ */

export type AuditFeed = {
  entries: AuditEntry[];
  summary: AuditSummary;
  /** True when more matching events exist than were returned. */
  truncated: boolean;
};

export async function getAuditFeed(query: AuditQuery = {}): Promise<AuditFeed> {
  // Ask for one more than we show so "truncated" is a fact, not a guess.
  const limit = query.limit ?? AUDIT_PAGE_SIZE;
  const entries = await getAuditEntries({ ...query, limit: limit + 1 });

  const truncated = entries.length > limit;
  const visible = truncated ? entries.slice(0, limit) : entries;

  return {
    entries: visible,
    summary: summarise(visible),
    truncated,
  };
}

export async function getAuditSummary(query: AuditQuery = {}): Promise<AuditSummary> {
  const feed = await getAuditFeed(query);
  return feed.summary;
}

export async function getAuditJobOptions() {
  return getAuditJobs();
}

/** Re-export the filter vocabulary so the client can render chips. */
export type AuditFilters = {
  tone: AuditTone | "all";
  source: AuditSource | "all";
  query: string;
  jobReference: string;
};
