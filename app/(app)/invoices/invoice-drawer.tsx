"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  Download,
  FileText,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { Icon } from "../../app-shell";
import { money } from "../../../lib/quotes-types";
import {
  canIssue,
  canMarkPaid,
  canVoid,
  type DerivedInvoice,
} from "../../../lib/invoices";
import {
  getInvoice,
  issueInvoice,
  markInvoicePaid,
  recordInvoiceExport,
  voidInvoice,
} from "./actions";

/* ------------------------------------------------------------------
   The live invoice.

   Body is grouped by origin — the agreed quote, then approved changes —
   because that is the question a customer actually asks: "why is this more
   than I agreed?". Pending changes sit in their own block and are never
   counted in the total.
   ------------------------------------------------------------------ */

function formatDay(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function signed(cents: number, currency: string) {
  if (cents === 0) return money(0, currency as "GBP" | "EUR");
  const abs = Math.abs(cents);
  const formatted = money(abs, currency as "GBP" | "EUR");
  return cents > 0 ? `+${formatted}` : `−${formatted}`;
}

function dueSummary(invoice: DerivedInvoice) {
  if (invoice.status === "paid") return "Paid";
  if (invoice.status === "void") return "Void";
  if (invoice.status === "draft") return "Not sent";

  const due = Date.parse(`${invoice.dueAt}T00:00:00.000Z`);
  const today = Date.parse(
    `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
  );
  const days = Math.round((due - today) / 86_400_000);

  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
}

export default function InvoiceDrawer({
  reference,
  onClose,
  onChanged,
}: {
  reference: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [invoice, setInvoice] = useState<DerivedInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const fresh = await getInvoice(reference);
      if (!fresh) {
        setError("That invoice no longer exists.");
      } else {
        setInvoice(fresh);
        setError(null);
      }
    } catch {
      setError("Could not load this invoice.");
    } finally {
      setLoading(false);
    }
  }, [reference]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Run a mutation, then re-read the derived invoice so the UI matches the DB. */
  const run = async (label: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
    if (pending) return;
    setPending(label);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "That did not work.");
      } else {
        await load();
        onChanged();
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(null);
    }
  };

  const handleExport = async () => {
    if (exporting || !invoice) return;
    setExporting(true);
    try {
      // The PDF itself is rendered client-side from this same data; recording
      // the export is what lets us warn when the live total later moves.
      await recordInvoiceExport(reference);
      await load();
      onChanged();
      window.print();
    } catch {
      setError("Could not prepare the PDF.");
    } finally {
      setExporting(false);
    }
  };

  const groups = invoice
    ? {
        quote: invoice.lines.filter((line) => line.source === "quote"),
        changes: invoice.lines.filter((line) => line.source === "change"),
      }
    : { quote: [], changes: [] };

  const busy = pending !== null;

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" onClick={onClose} />
      <aside
        className="job-drawer is-open q-drawer iv-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Invoice ${reference}`}
      >
        <header className="q-drawer-head">
          <div style={{ minWidth: 0 }}>
            <p className="drawer-eyebrow">Invoice {reference}</p>
            <h2 className="q-drawer-title">
              {loading ? "Loading…" : (invoice?.jobTitle ?? "Invoice")}
            </h2>
            {invoice ? (
              <div className="q-drawer-meta">
                <span className={`status status-${invoice.status === "issued" ? "sent" : invoice.status}`}>
                  <span className="status-dot" />
                  {statusWord(invoice.status)}
                </span>
                <span className="ch-dot" />
                <span>{invoice.jobReference}</span>
                <span className="ch-dot" />
                <span>{invoice.customer.name}</span>
              </div>
            ) : null}
          </div>
          <div className="q-drawer-actions">
            <button
              ref={closeRef}
              className="icon-btn"
              type="button"
              aria-label="Close"
              onClick={onClose}
            >
              <Icon icon={X} />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          {loading ? (
            <div className="iv-loading" aria-busy="true">
              <span className="sk sk-block" />
              <span className="sk sk-block" />
              <span className="sk sk-block" />
            </div>
          ) : !invoice ? (
            <div className="drawer-error" role="alert">
              <Icon icon={AlertTriangle} className="ico ico-sm" />
              {error ?? "This invoice could not be loaded."}
            </div>
          ) : (
            <>
              {error ? (
                <div className="drawer-error" role="alert">
                  <Icon icon={AlertTriangle} className="ico ico-sm" />
                  {error}
                </div>
              ) : null}

              {/* ---------------- Live / stale notice ---------------- */}
              <section className="q-section">
                {invoice.staleSinceExport ? (
                  <div className="iv-stale" role="status">
                    <span className="iv-live-icon is-warn" aria-hidden="true">
                      <Icon icon={AlertTriangle} className="ico ico-sm" />
                    </span>
                    <div>
                      <strong>The PDF you sent is out of date</strong>
                      <p>
                        It showed {money(invoice.issuedSnapshotCents ?? 0, invoice.currency as "GBP")}.
                        The live total is now {money(invoice.totalCents, invoice.currency as "GBP")}
                        {" "}({signed(invoice.driftCents, invoice.currency)}). Export again before
                        chasing payment.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="iv-live">
                    <span className="iv-live-icon" aria-hidden="true">
                      <Icon icon={RefreshCw} className="ico ico-sm" />
                    </span>
                    <div>
                      <strong>This invoice is live</strong>
                      <p>
                        {invoice.pendingChangesCents !== 0
                          ? "Approving a pending change updates this total automatically."
                          : "It always shows the approved quote plus every approved change."}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {/* ---------------- The document ---------------- */}
              <section className="q-section">
                <div className="iv-doc">
                  <div className="iv-doc-head">
                    <div className="iv-party">
                      <p className="iv-party-label">From</p>
                      <p className="iv-party-name">{invoice.business.name}</p>
                      {invoice.business.address ? (
                        <p className="iv-party-line">{invoice.business.address}</p>
                      ) : null}
                      {invoice.business.email ? (
                        <p className="iv-party-line">{invoice.business.email}</p>
                      ) : null}
                      {invoice.business.phone ? (
                        <p className="iv-party-line">{invoice.business.phone}</p>
                      ) : null}
                      {invoice.business.vatNumber ? (
                        <p className="iv-party-line">VAT {invoice.business.vatNumber}</p>
                      ) : null}
                    </div>
                    <div className="iv-party iv-party-right">
                      <p className="iv-party-label">Bill to</p>
                      <p className="iv-party-name">{invoice.customer.name}</p>
                      {invoice.customer.email ? (
                        <p className="iv-party-line">{invoice.customer.email}</p>
                      ) : null}
                      {invoice.site.city ? (
                        <p className="iv-party-line">{invoice.site.city}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="iv-doc-meta">
                    <span>
                      <strong>Issued</strong> {formatDay(invoice.issuedAt)}
                    </span>
                    <span>
                      <strong>Due</strong> {formatDay(invoice.dueAt)}
                    </span>
                    <span className="iv-doc-status">{dueSummary(invoice)}</span>
                  </div>

                  <div className="iv-group">
                    <div className="iv-group-head">
                      <span>Agreed quote · {invoice.quoteReference}</span>
                      <span className="iv-group-total">
                        {money(invoice.baselineCents, invoice.currency as "GBP")}
                      </span>
                    </div>
                    {groups.quote.map((line) => (
                      <div className="iv-row" key={line.id}>
                        <div className="iv-row-main">
                          <span className="iv-row-desc">{line.description}</span>
                          {line.quantity !== 1 ? (
                            <span className="iv-row-qty">
                              {line.quantity} ×{" "}
                              {money(line.unitPriceCents, invoice.currency as "GBP")}
                            </span>
                          ) : null}
                        </div>
                        <span className="iv-row-amount">
                          {money(line.totalCents, invoice.currency as "GBP")}
                        </span>
                      </div>
                    ))}
                  </div>

                  {groups.changes.length > 0 ? (
                    <div className="iv-group iv-group-changes">
                      <div className="iv-group-head">
                        <span>
                          <Icon icon={CheckCircle2} className="ico ico-xs" />
                          Approved changes
                        </span>
                        <span
                          className={`iv-group-total ${invoice.approvedChangesCents < 0 ? "ch-neg" : "ch-pos"}`}
                        >
                          {signed(invoice.approvedChangesCents, invoice.currency)}
                        </span>
                      </div>
                      {groups.changes.map((line) => (
                        <div className="iv-row" key={line.id}>
                          <div className="iv-row-main">
                            <span className="iv-row-desc">{line.description}</span>
                            {line.changeReference ? (
                              <span className="iv-row-src">{line.changeReference}</span>
                            ) : null}
                          </div>
                          <span
                            className={`iv-row-amount ${line.totalCents < 0 ? "ch-neg" : "ch-pos"}`}
                          >
                            {signed(line.totalCents, invoice.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="iv-total">
                    <div className="iv-total-row">
                      <span>Agreed quote</span>
                      <span>{money(invoice.baselineCents, invoice.currency as "GBP")}</span>
                    </div>
                    {invoice.approvedChangesCents !== 0 ? (
                      <div
                        className={`iv-total-row ${invoice.approvedChangesCents < 0 ? "is-neg" : "is-pos"}`}
                      >
                        <span>
                          {invoice.approvedChangesCents < 0 ? (
                            <ArrowDownRight size={13} strokeWidth={2.6} aria-hidden="true" />
                          ) : (
                            <ArrowUpRight size={13} strokeWidth={2.6} aria-hidden="true" />
                          )}{" "}
                          Approved changes
                        </span>
                        <span>{signed(invoice.approvedChangesCents, invoice.currency)}</span>
                      </div>
                    ) : null}
                    <div className="iv-total-final">
                      <span>{invoice.status === "paid" ? "Paid" : "Total due"}</span>
                      <span className="iv-total-value">
                        {money(invoice.totalCents, invoice.currency as "GBP")}
                      </span>
                    </div>
                    {invoice.status === "paid" && invoice.paidAt ? (
                      <p className="iv-total-note is-ok">
                        <Icon icon={Check} className="ico ico-xs" />
                        Paid on {formatDay(invoice.paidAt.slice(0, 10))}
                      </p>
                    ) : null}
                  </div>

                  {invoice.pendingChangesCents !== 0 ? (
                    <div className="iv-pending">
                      <div className="iv-pending-head">
                        <Icon icon={FileText} className="ico ico-xs" />
                        Awaiting approval — not included
                      </div>
                      <p>
                        {money(
                          invoice.pendingChangesCents,
                          invoice.currency as "GBP",
                        )}{" "}
                        of changes are still with the customer. If approved, this total becomes{" "}
                        <strong>
                          {money(invoice.projectedCents, invoice.currency as "GBP")}
                        </strong>
                        .
                      </p>
                    </div>
                  ) : null}

                  {invoice.notes ? <p className="iv-doc-notes">{invoice.notes}</p> : null}
                </div>
              </section>

              {/* ---------------- Payment details ---------------- */}
              <section className="q-section">
                <h3 className="q-section-title">Payment</h3>
                <div className="iv-context">
                  <div className="iv-context-row">
                    <span>Terms</span>
                    <span>
                      {invoice.termsDays === 0
                        ? "Due on receipt"
                        : `${invoice.termsDays} days`}
                    </span>
                  </div>
                  <div className="iv-context-row">
                    <span>Reference</span>
                    <span>{invoice.reference}</span>
                  </div>
                  <div className="iv-context-row">
                    <span>Quote</span>
                    <span>{invoice.quoteReference}</span>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="drawer-foot iv-drawer-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>

          {invoice ? (
            <div className="iv-foot-actions">
              {canIssue(invoice.status) ? (
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => void run("issue", () => issueInvoice(reference))}
                >
                  <Icon icon={Send} className="ico ico-sm" />
                  {pending === "issue" ? "Issuing…" : "Issue invoice"}
                </button>
              ) : null}

              {canMarkPaid(invoice.status) ? (
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => void run("paid", () => markInvoicePaid(reference))}
                >
                  <Icon icon={CheckCircle2} className="ico ico-sm" />
                  {pending === "paid" ? "Saving…" : "Mark paid"}
                </button>
              ) : null}

              {canVoid(invoice.status) ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => void run("void", () => voidInvoice(reference, "Cancelled"))}
                >
                  <Icon icon={Ban} className="ico ico-sm" />
                  {pending === "void" ? "Voiding…" : "Void"}
                </button>
              ) : null}

              <button
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={exporting || busy}
                aria-busy={exporting}
                onClick={() => void handleExport()}
              >
                <Icon icon={Download} className="ico ico-sm" />
                {exporting ? "Preparing…" : "Export PDF"}
              </button>
            </div>
          ) : null}
        </footer>
      </aside>
    </>
  );
}

function statusWord(status: DerivedInvoice["status"]) {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Paid";
  if (status === "void") return "Void";
  return "Draft";
}
