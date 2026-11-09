import { getDb } from "@/lib/db";

import { classify } from "./audit";
import type { AuditSource, AuditTone } from "./audit-shared";
import { changeOrdersCollection } from "./changes";
import { invoicesCollection } from "./invoices";
import { quotesCollection } from "./quotes";
import { requireOwnerId } from "./ownership";
import {
  addTo,
  pickPrimaryCurrency,
  type Dashboard,
  type DashboardActivity,
  type DashboardJobRow,
  type DashboardMoney,
} from "./dashboard-shared";

/* ------------------------------------------------------------------
   Overview — the read side.

   Everything on the overview is derived from the real documents. There is
   no second store of summary figures to keep in step: the dashboard is a
   projection of jobs, quotes, change orders and invoices, so it cannot
   disagree with the screens that own that data.

   Two rules shape the aggregation:

   1. Only *live* money is counted. A rejected quote contributes nothing, a
      void invoice contributes nothing, and a change order that is still
      awaiting a decision is reported separately rather than in the total.
   2. Money is accumulated per currency. Blending GBP and EUR into one
      figure is arithmetic on incompatible units, so each bucket is a map
      keyed by ISO code and the UI shows a headline plus a count.

   The whole read is bounded: jobs are capped for the recent table and the
   activity feed is capped, so the overview stays fast as history grows.
   ------------------------------------------------------------------ */

const RECENT_JOB_LIMIT = 8;
const ACTIVITY_LIMIT = 6;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  inprogress: "In progress",
  complete: "Complete",
};

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function moneyLabel(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

function updatedLabel(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** True when the timestamp falls in the current calendar month. */
function isThisMonth(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export async function getDashboard(): Promise<Dashboard> {
  const db = await getDb();
  const ownerId = await requireOwnerId();

  const [rawJobs, quotes, changes, invoices] = await Promise.all([
    db
      .collection("jobs")
      .find({ ownerId })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(RECENT_JOB_LIMIT)
      .toArray(),
    quotesCollection(db).find({ ownerId }).toArray(),
    changeOrdersCollection(db).find({ ownerId }).toArray(),
    invoicesCollection(db).find({ ownerId }).toArray(),
  ]);

  const money: DashboardMoney = {
    agreed: {},
    protectedChanges: {},
    awaitingChanges: {},
    outstanding: {},
    overdue: {},
  };

  const currencySeen: string[] = [];
  const noteCurrency = (code: unknown) => currencySeen.push(String(code ?? "GBP").toUpperCase());

  // ---- Quotes -------------------------------------------------------
  const quoteByJob = new Map<string, (typeof quotes)[number]>();
  let quotesAwaitingCount = 0;

  for (const quote of quotes) {
    noteCurrency(quote.currency);
    quoteByJob.set(String(quote.jobReference), quote);

    if (quote.status === "sent") quotesAwaitingCount += 1;

    if (quote.status === "approved") {
      // The agreed figure is the baseline plus whatever has been approved
      // since — the same arithmetic the quotes screen displays.
      addTo(
        money.agreed,
        quote.currency,
        Math.round(Number(quote.subtotalCents) || 0) +
          Math.round(Number(quote.approvedChangesCents) || 0),
      );
    }
  }

  // ---- Change orders ------------------------------------------------
  let protectedCount = 0;
  let awaitingCount = 0;

  for (const change of changes) {
    noteCurrency(change.currency);
    const net = Math.round(Number(change.netCents) || 0);

    if (change.status === "approved") {
      addTo(money.protectedChanges, change.currency, net);
      if (isThisMonth(String(change.updatedAt ?? change.issuedAt ?? ""))) protectedCount += 1;
    } else if (change.status === "sent" || change.status === "draft") {
      addTo(money.awaitingChanges, change.currency, net);
      awaitingCount += 1;
    }
  }

  // ---- Invoices -----------------------------------------------------
  let invoicesOutstanding = 0;
  let invoicesOverdue = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const invoice of invoices) {
    noteCurrency(invoice.currency);
    if (invoice.status !== "issued") continue;

    // Re-derive the live balance: baseline quote plus approved changes at
    // read time, exactly as the invoices screen does. Using a stored figure
    // would let the overview drift from the invoice it describes.
    const quote = quoteByJob.get(String(invoice.jobReference));
    const baseline = Math.round(Number(quote?.subtotalCents) || 0);
    const approvedChanges = Math.round(Number(quote?.approvedChangesCents) || 0);
    const live = baseline + approvedChanges;

    invoicesOutstanding += 1;
    addTo(money.outstanding, invoice.currency, live);

    if (String(invoice.dueAt ?? "") < today) {
      invoicesOverdue += 1;
      addTo(money.overdue, invoice.currency, live);
    }
  }

  // ---- Jobs table ---------------------------------------------------
  const jobs: DashboardJobRow[] = rawJobs.map((doc) => {
    const reference = String(doc.reference ?? "");
    const quote = quoteByJob.get(reference);
    const customer = String((doc.customer as { name?: string } | undefined)?.name ?? "");
    const currency = String(doc.currency ?? quote?.currency ?? "GBP").toUpperCase();

    const status = String(doc.status ?? "draft");
    const totalCents = Math.round(Number(doc.totalCents) || 0);
    const quoteCents =
      quote != null
        ? Math.round(Number(quote.subtotalCents) || 0)
        : Math.round(Number(doc.totalCents) || 0);
    const changeCents = totalCents - quoteCents;

    return {
      reference,
      title: String((doc.job as { title?: string } | undefined)?.title ?? "Untitled job"),
      customer,
      initials: initialsFrom(customer),
      city: String((doc.site as { city?: string } | undefined)?.city ?? "—"),
      status,
      statusLabel: STATUS_LABEL[status] ?? status,
      quoteLabel: quote ? moneyLabel(quoteCents, currency) : "—",
      changeLabel:
        changeCents === 0
          ? "—"
          : `${changeCents < 0 ? "−" : "+"}${moneyLabel(Math.abs(changeCents), currency)}`,
      changeTone: changeCents === 0 ? "none" : changeCents < 0 ? "credit" : "add",
      totalLabel: moneyLabel(totalCents, currency),
      updatedLabel: updatedLabel(String(doc.updatedAt ?? doc.createdAt ?? "")),
      updatedAtMs: Date.parse(String(doc.updatedAt ?? doc.createdAt ?? "")) || 0,
    };
  });

  // ---- Activity feed -------------------------------------------------
  const activity: DashboardActivity[] = [];

  const collect = (
    source: AuditSource,
    documentReference: string,
    jobReference: string,
    currency: string,
    activityList: unknown,
    subject: string,
  ) => {
    const list = Array.isArray(activityList) ? activityList : [];
    for (const raw of list) {
      const event = raw as { type?: string; label?: string; detail?: string; at?: string };
      const at = String(event.at ?? "");
      if (!at) continue;
      const type = String(event.type ?? "other");
      // Exporting a PDF is bookkeeping, not work. Keep the feed for things a
      // person would recognise as progress.
      if (type === "noted") continue;

      activity.push({
        id: `${source}:${documentReference}:${type}:${at}`,
        tone: classify(source, type, undefined) as AuditTone,
        label: String(event.label ?? type),
        detail: String(event.detail ?? "") || subject,
        documentReference,
        jobReference,
        at,
        ago: "",
      });
    }
  };

  for (const quote of quotes) {
    collect(
      "quote",
      String(quote.reference),
      String(quote.jobReference),
      String(quote.currency),
      quote.activity,
      String(quote.title ?? ""),
    );
  }
  for (const change of changes) {
    collect(
      "change",
      String(change.reference),
      String(change.jobReference),
      String(change.currency),
      change.activity,
      String(change.summary ?? ""),
    );
  }
  for (const invoice of invoices) {
    // A voided invoice is a cancelled document. Its whole life story (created,
    // issued, exported, voided) is noise on a glance screen and would bury
    // real work — its own screen still has the full trail.
    if (invoice.status === "void") continue;

    collect(
      "invoice",
      String(invoice.reference),
      String(invoice.jobReference),
      String(invoice.currency),
      invoice.activity,
      String(invoice.jobTitle ?? ""),
    );
  }

  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  // A single job can generate several events in a row; the overview is a
  // glance, so the newest few distinct documents are enough.
  const seenDocuments = new Set<string>();
  const recentActivity = activity
    .filter((entry) => {
      const key = `${entry.documentReference}:${entry.label}`;
      if (seenDocuments.has(key)) return false;
      seenDocuments.add(key);
      return true;
    })
    .slice(0, ACTIVITY_LIMIT);

  const isEmpty =
    rawJobs.length === 0 && quotes.length === 0 && changes.length === 0 && invoices.length === 0;

  return {
    counts: {
      jobs: rawJobs.length,
      jobsInProgress: rawJobs.filter((doc) => String(doc.status) === "inprogress").length,
      quotesAwaiting: quotesAwaitingCount,
      changesAwaiting: awaitingCount,
      invoicesOutstanding,
      invoicesOverdue,
    },
    money,
    jobs,
    activity: recentActivity,
    isEmpty,
    protectedCount,
    awaitingCount,
    quotesAwaitingCount,
    primaryCurrency: pickPrimaryCurrency(currencySeen),
  };
}
