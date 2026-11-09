/* ------------------------------------------------------------------
   Invoices — view models for the UI layer.

   One invoice per job, and it is *live*: it holds no copy of the money.
   Every figure is derived from the job's approved quote plus its approved
   change orders at render time, so the invoice can never disagree with the
   work it bills.

   That is a deliberate departure from the "snapshot on issue" rule used
   for quotes and change orders. Those are agreements the customer signed,
   so they must freeze. An invoice here is a *running statement of account*
   for an in-progress job — the tradesperson sends a PDF when they want a
   fixed copy, and the PDF is the frozen artefact.

   The consequence worth keeping in mind while reading the UI: if a change
   order is approved after a PDF was sent, the on-screen invoice moves and
   the sent PDF does not. The screen says so explicitly.
   ------------------------------------------------------------------ */

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_FILTERS: { id: InvoiceStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "issued", label: "Issued" },
  { id: "paid", label: "Paid" },
  { id: "void", label: "Void" },
];

/** One row of the invoice body. Every row carries where it came from. */
export type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  /** Minor units (pence/cents). Always positive; `direction` carries the sign. */
  unitPriceCents: number;
  direction: "add" | "credit";
  /** "quote" rows are the agreed baseline; "change" rows came later. */
  source: "quote" | "change";
  /** Present on change rows: which change order added this. */
  changeReference?: string;
  changeSummary?: string;
};

export type Invoice = {
  /** Gapless per-year number, e.g. INV-2026-0001. */
  id: string;
  jobReference: string;
  jobTitle: string;
  customer: string;
  customerInitials: string;
  customerEmail: string;
  city: string;
  currency: "GBP" | "EUR";
  status: InvoiceStatus;
  /** Every billable row: the quote's lines plus every approved change. */
  lines: InvoiceLine[];
  /** Agreed quote total, before changes. */
  baselineCents: number;
  /** Sum of approved change orders — may be negative (net credit). */
  approvedChangesCents: number;
  /** Approved but not yet agreed: shown, never billed. */
  pendingChangesCents: number;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  notes: string;
  /** The plumber's own trading details, printed on the PDF. */
  business: {
    name: string;
    address: string;
    email: string;
    phone: string;
    vatNumber?: string;
  };
};

/* ------------------------------------------------------------------
   Derived money. The single place an invoice total is calculated, so the
   list, the drawer and any future PDF renderer cannot drift apart.
   ------------------------------------------------------------------ */

export function invoiceLineTotal(line: InvoiceLine) {
  const magnitude = Math.round(line.quantity * line.unitPriceCents);
  return line.direction === "credit" ? -magnitude : magnitude;
}

/** What the customer owes right now: baseline + approved changes. */
export function invoiceTotal(invoice: Invoice) {
  return invoice.baselineCents + invoice.approvedChangesCents;
}

/** What the total becomes if every pending change is approved. */
export function invoiceProjected(invoice: Invoice) {
  return invoiceTotal(invoice) + invoice.pendingChangesCents;
}

/** Split the body so the PDF and the screen can group rows by origin. */
export function invoiceLineGroups(invoice: Invoice) {
  return {
    quote: invoice.lines.filter((line) => line.source === "quote"),
    changes: invoice.lines.filter((line) => line.source === "change"),
  };
}

/**
 * Days until the invoice falls due. Negative means overdue.
 *
 * Takes `now` as an argument rather than calling `Date.now()`: Next.js 16
 * rejects uncached clock reads during prerender of a Client Component.
 */
export function daysUntilDue(iso: string, now: number | null) {
  if (now === null) return null;
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return null;
  return Math.ceil((due - now) / 86_400_000);
}

export function dueNote(invoice: Invoice, now: number | null) {
  if (invoice.status === "paid") return { tone: "paid" as const, text: "Paid" };
  if (invoice.status === "void") return { tone: "void" as const, text: "Void" };
  if (invoice.status === "draft") return { tone: "calm" as const, text: "Not sent" };

  const days = daysUntilDue(invoice.dueAt, now);
  if (days === null) return null;
  if (days < 0) return { tone: "danger" as const, text: `${Math.abs(days)} days overdue` };
  if (days === 0) return { tone: "warn" as const, text: "Due today" };
  if (days <= 7) return { tone: "warn" as const, text: `Due in ${days} days` };
  return { tone: "calm" as const, text: `Due in ${days} days` };
}
