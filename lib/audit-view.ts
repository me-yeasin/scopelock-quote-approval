import type { AuditEntry } from "./audit-shared";

/* ------------------------------------------------------------------
   Audit log — presentation helpers.

   Kept separate from `lib/audit.ts` because that module talks to the
   database and must stay server-only. These are pure functions used by the
   Client Component, so importing them never drags `mongodb` into the
   browser bundle.
   ------------------------------------------------------------------ */

/** Day bucket key, e.g. "2026-12-09". */
export function dayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

/**
 * "Today", "Yesterday", or "9 December 2026".
 *
 * `todayKey` is empty during prerender — the clock is unknown on the server —
 * in which case every bucket falls back to its plain date. That keeps the
 * static HTML deterministic and lets the client fill in the relative label.
 */
export function dayHeading(iso: string, todayKey: string) {
  const key = dayKey(iso);
  if (key === "unknown") return "Unknown date";

  const plain = () =>
    new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  if (!todayKey) return plain();
  if (key === todayKey) return "Today";

  const yesterday = new Date(`${todayKey}T00:00:00.000Z`);
  if (!Number.isNaN(yesterday.getTime())) {
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (key === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  }

  return plain();
}

export function timeOfDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Group entries into day buckets, newest first. */
export function groupByDay(entries: AuditEntry[]) {
  const groups = new Map<string, AuditEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.at);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      items: items.sort((a, b) => (a.at < b.at ? 1 : -1)),
    }));
}
