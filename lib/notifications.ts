import { getDb } from "@/lib/db";

import { changeOrdersCollection } from "./changes";
import { invoicesCollection } from "./invoices";
import { quotesCollection } from "./quotes";
import {
  NOTIFICATION_PRIORITY,
  type Notification,
  type NotificationFeed,
} from "./notifications-shared";
import {
  getReadVersions,
  notificationVersion,
  pruneReadRecords,
} from "./notification-reads";

/* ------------------------------------------------------------------
   Notifications — derived, never stored.

   Every item is computed from the live documents, which is what makes the
   badge honest: decide a quote and it disappears; raise the invoice and the
   "ready to invoice" item goes with it. Nothing has to be dismissed, so the
   count cannot drift out of date or accumulate cruft.

   The alternative — a notifications collection with an unread flag — would
   need a writer at every decision point and a "mark all read" that can
   silently fail. Deriving the answer from the data it describes is both
   simpler and impossible to get wrong.

   A cap keeps the panel short; the count reflects the whole set so the
   badge does not understate the work.
   ------------------------------------------------------------------ */

const MAX_ITEMS = 25;

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function getNotifications(): Promise<NotificationFeed> {
  const db = await getDb();

  const [quotes, changes, invoices] = await Promise.all([
    quotesCollection(db).find({}).toArray(),
    changeOrdersCollection(db).find({}).toArray(),
    invoicesCollection(db).find({}).toArray(),
  ]);

  const items: Notification[] = [];
  const day = today();

  // A job that has an invoice at all does not need "ready to invoice".
  const invoicedJobs = new Set(
    invoices
      .filter((invoice) => invoice.status !== "void")
      .map((invoice) => String(invoice.jobReference)),
  );

  // ---- Quotes the customer has not answered -------------------------
  for (const quote of quotes) {
    if (quote.status !== "sent") continue;

    items.push({
      id: `quote-waiting:${quote.reference}`,
      kind: "quote-waiting",
      tone: "calm",
      title: `Quote ${quote.reference} is out for approval`,
      detail: `${quote.customer?.name || "The customer"} has not replied yet — ${money(
        Number(quote.subtotalCents) || 0,
        quote.currency,
      )} at stake.`,
      href: "/quotes",
      jobReference: String(quote.jobReference),
      documentReference: String(quote.reference),
      since: String(quote.link?.sentAt ?? quote.updatedAt ?? quote.createdAt ?? ""),
      amountCents: Math.round(Number(quote.subtotalCents) || 0),
      currency: String(quote.currency ?? "GBP").toUpperCase(),
      read: false,
    });
  }

  // ---- Change orders awaiting a decision ----------------------------
  for (const change of changes) {
    if (change.status !== "sent" && change.status !== "draft") continue;

    const net = Math.round(Number(change.netCents) || 0);
    const verb = change.status === "draft" ? "is still a draft" : "is awaiting approval";

    items.push({
      id: `change-waiting:${change.reference}`,
      kind: "change-waiting",
      tone: "action",
      title: `Change ${change.reference} ${verb}`,
      detail: `${change.summary || "Change order"} — ${net < 0 ? "−" : "+"}${money(
        Math.abs(net),
        change.currency,
      )} not yet agreed.`,
      href: "/changes",
      jobReference: String(change.jobReference),
      documentReference: String(change.reference),
      since: String(change.updatedAt ?? change.issuedAt ?? change.createdAt ?? ""),
      amountCents: net,
      currency: String(change.currency ?? "GBP").toUpperCase(),
      read: false,
    });
  }

  // ---- Invoices past their due date ---------------------------------
  for (const invoice of invoices) {
    if (invoice.status !== "issued") continue;
    if (String(invoice.dueAt ?? "") >= day) continue;

    // Re-derive the live balance, as the invoices screen does.
    const quote = quotes.find(
      (candidate) => String(candidate.jobReference) === String(invoice.jobReference),
    );
    const live =
      Math.round(Number(quote?.subtotalCents) || 0) +
      Math.round(Number(quote?.approvedChangesCents) || 0);

    const overdueDays = Math.max(
      0,
      Math.round(
        (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${invoice.dueAt}T00:00:00Z`)) / 86_400_000,
      ),
    );

    items.push({
      id: `invoice-overdue:${invoice.reference}`,
      kind: "invoice-overdue",
      tone: "warn",
      title: `Invoice ${invoice.reference} is ${overdueDays} ${
        overdueDays === 1 ? "day" : "days"
      } overdue`,
      detail: `${money(live, invoice.currency)} unpaid since ${new Date(
        `${invoice.dueAt}T00:00:00Z`,
      ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`,
      href: "/invoices",
      jobReference: String(invoice.jobReference),
      documentReference: String(invoice.reference),
      since: String(invoice.dueAt ?? ""),
      daysOverdue: overdueDays,
      amountCents: live,
      currency: String(invoice.currency ?? "GBP").toUpperCase(),
      read: false,
    });
  }

  // ---- Approved work with nothing billed ----------------------------
  for (const quote of quotes) {
    if (quote.status !== "approved") continue;
    if (invoicedJobs.has(String(quote.jobReference))) continue;

    items.push({
      id: `ready-to-invoice:${quote.reference}`,
      kind: "ready-to-invoice",
      tone: "calm",
      title: "Approved job is ready to invoice",
      detail: `${quote.title || quote.jobReference} — ${money(
        Math.round(Number(quote.subtotalCents) || 0) +
          Math.round(Number(quote.approvedChangesCents) || 0),
        quote.currency,
      )} agreed and not yet billed.`,
      href: "/invoices/new",
      jobReference: String(quote.jobReference),
      documentReference: String(quote.reference),
      since: String(quote.decidedAt ?? quote.updatedAt ?? ""),
      currency: String(quote.currency ?? "GBP").toUpperCase(),
      read: false,
    });
  }

  // Most urgent first; within a kind, oldest first so nothing is forgotten.
  items.sort((a, b) => {
    const byKind = NOTIFICATION_PRIORITY[a.kind] - NOTIFICATION_PRIORITY[b.kind];
    if (byKind !== 0) return byKind;
    return a.since < b.since ? -1 : 1;
  });

  // ---- Apply stored read state -------------------------------------
  // A record only counts when its fingerprint still matches. If the item's
  // wording or amount changed since it was read, it is news again.
  let readVersions = new Map<string, string>();
  try {
    readVersions = await getReadVersions();
  } catch {
    // Read state is a convenience: if it cannot be loaded, show everything
    // as unread rather than hiding work the user may not have seen.
  }

  for (const item of items) {
    const version = notificationVersion(item);
    item.read = readVersions.get(item.id) === version;
  }

  // Prune records whose notification no longer exists, so the collection
  // cannot grow without bound as jobs are deleted.
  try {
    await pruneReadRecords(items.map((item) => item.id));
  } catch {
    // Housekeeping only; never fail the feed over it.
  }

  const unread = items.filter((item) => !item.read);

  return {
    items: items.slice(0, MAX_ITEMS),
    // The badge counts unread items across the whole set, not just the slice
    // the panel shows.
    count: unread.length,
    total: items.length,
    urgentCount: unread.filter((item) => item.tone === "warn" || item.tone === "action").length,
  };
}
