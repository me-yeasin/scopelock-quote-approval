"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  RefreshCw,
  X,
} from "lucide-react";
import { Icon } from "../app-shell";
import {
  INVOICE_STATUS_LABEL,
  dueNote,
  invoiceLineGroups,
  invoiceLineTotal,
  invoiceProjected,
  invoiceTotal,
  type Invoice,
} from "../../lib/invoices-types";
import { money } from "../../lib/quotes-types";
import { useNow } from "../quotes/use-now";

/* ------------------------------------------------------------------
   The live invoice, displayed as the document it becomes.

   Body is grouped by origin — agreed quote first, then approved changes —
   because that is the question a customer actually asks: "why is this more
   than what I agreed?" The changes block sits directly under the quote
   lines so the two can be compared without hunting.

   Pending changes are shown in a separate, clearly non-billable block.
   ------------------------------------------------------------------ */

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function signed(cents: number, currency: "GBP" | "EUR") {
  if (cents === 0) return money(0, currency);
  const abs = Math.abs(cents);
  return cents > 0 ? `+${money(abs, currency)}` : `−${money(abs, currency)}`;
}

export default function InvoiceDrawer({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const now = useNow();

  const total = invoiceTotal(invoice);
  const projected = invoiceProjected(invoice);
  const groups = invoiceLineGroups(invoice);
  const due = dueNote(invoice, now);
  const isSettled = invoice.status === "paid" || invoice.status === "void";

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    // Not wired yet: this is the layout pass.
    await new Promise((resolve) => setTimeout(resolve, 900));
    setExporting(false);
    setActionError("PDF export is not connected yet.");
  };

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" onClick={onClose} />
      <aside
        className="job-drawer is-open q-drawer iv-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Invoice ${invoice.id}`}
      >
        <header className="q-drawer-head">
          <div style={{ minWidth: 0 }}>
            <p className="drawer-eyebrow">Invoice {invoice.id}</p>
            <h2 className="q-drawer-title">{invoice.jobTitle}</h2>
            <div className="q-drawer-meta">
              <span className={`status status-${invoice.status === "issued" ? "sent" : invoice.status}`}>
                <span className="status-dot" />
                {INVOICE_STATUS_LABEL[invoice.status]}
              </span>
              <span className="ch-dot" />
              <span>{invoice.jobReference}</span>
              <span className="ch-dot" />
              <span>{invoice.customer}</span>
            </div>
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
          {/* ---------------- Live banner ---------------- */}
          <section className="q-section">
            <div className="iv-live">
              <span className="iv-live-icon" aria-hidden="true">
                <Icon icon={RefreshCw} className="ico ico-sm" />
              </span>
              <div>
                <strong>This invoice is live</strong>
                <p>
                  It always shows the agreed quote plus every approved change.
                  {invoice.pendingChangesCents > 0
                    ? " Approving a pending change updates it automatically."
                    : " Approve a change and the total moves here on its own."}
                </p>
              </div>
            </div>

            {actionError ? (
              <div className="drawer-error" role="alert">
                <Icon icon={X} className="ico ico-sm" />
                {actionError}
              </div>
            ) : null}
          </section>

          {/* ---------------- The document ---------------- */}
          <section className="q-section">
            <div className="iv-doc">
              {/* Bill from / bill to */}
              <div className="iv-doc-head">
                <div className="iv-party">
                  <p className="iv-party-label">From</p>
                  <p className="iv-party-name">{invoice.business.name}</p>
                  <p className="iv-party-line">{invoice.business.address}</p>
                  <p className="iv-party-line">{invoice.business.email}</p>
                  <p className="iv-party-line">{invoice.business.phone}</p>
                  {invoice.business.vatNumber ? (
                    <p className="iv-party-line">VAT {invoice.business.vatNumber}</p>
                  ) : null}
                </div>
                <div className="iv-party iv-party-right">
                  <p className="iv-party-label">Bill to</p>
                  <p className="iv-party-name">{invoice.customer}</p>
                  <p className="iv-party-line">{invoice.customerEmail}</p>
                  <p className="iv-party-line">{invoice.city}</p>
                </div>
              </div>

              <div className="iv-doc-meta">
                <span>
                  <strong>Issued</strong> {formatDate(invoice.issuedAt)}
                </span>
                <span>
                  <strong>Due</strong> {formatDate(invoice.dueAt)}
                </span>
                <span className="iv-doc-status">{due?.text ?? ""}</span>
              </div>

              {/* ---- Agreed quote ---- */}
              <div className="iv-group">
                <div className="iv-group-head">
                  <span>Agreed quote</span>
                  <span className="iv-group-total">
                    {money(invoice.baselineCents, invoice.currency)}
                  </span>
                </div>
                {groups.quote.map((line) => {
                  const amount = invoiceLineTotal(line);
                  return (
                    <div className="iv-row" key={line.id}>
                      <div className="iv-row-main">
                        <span className="iv-row-desc">{line.description}</span>
                        {line.quantity !== 1 ? (
                          <span className="iv-row-qty">
                            {line.quantity} × {money(line.unitPriceCents, invoice.currency)}
                          </span>
                        ) : null}
                      </div>
                      <span className={`iv-row-amount${amount < 0 ? " ch-neg" : ""}`}>
                        {money(amount, invoice.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* ---- Approved changes ---- */}
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
                  {groups.changes.map((line) => {
                    const amount = invoiceLineTotal(line);
                    return (
                      <div className="iv-row" key={line.id}>
                        <div className="iv-row-main">
                          <span className="iv-row-desc">{line.description}</span>
                          {line.changeReference ? (
                            <span className="iv-row-src">
                              {line.changeReference}
                              {line.changeSummary ? ` · ${line.changeSummary}` : ""}
                            </span>
                          ) : null}
                        </div>
                        <span className={`iv-row-amount${amount < 0 ? " ch-neg" : " ch-pos"}`}>
                          {signed(amount, invoice.currency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* ---- Total ---- */}
              <div className="iv-total">
                <div className="iv-total-row">
                  <span>Agreed quote</span>
                  <span>{money(invoice.baselineCents, invoice.currency)}</span>
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
                  <span className="iv-total-value">{money(total, invoice.currency)}</span>
                </div>
                {invoice.status === "paid" && invoice.paidAt ? (
                  <p className="iv-total-note is-ok">
                    <Icon icon={Check} className="ico ico-xs" />
                    Paid on {formatDate(invoice.paidAt)}
                  </p>
                ) : null}
              </div>

              {/* ---- Pending: shown, explicitly not billed ---- */}
              {invoice.pendingChangesCents > 0 ? (
                <div className="iv-pending">
                  <div className="iv-pending-head">
                    <Icon icon={FileText} className="ico ico-xs" />
                    Awaiting approval — not included
                  </div>
                  <p>
                    {money(invoice.pendingChangesCents, invoice.currency)} of changes are
                    still with the customer. If approved, the total becomes{" "}
                    <strong>{money(projected, invoice.currency)}</strong>.
                  </p>
                </div>
              ) : null}

              {invoice.notes ? <p className="iv-doc-notes">{invoice.notes}</p> : null}
            </div>
          </section>

          {/* ---------------- Business details ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">Paid to</h3>
            <div className="iv-context">
              <div className="iv-context-row">
                <span>
                  <Icon icon={Building2} className="ico ico-xs" /> Account name
                </span>
                <span>{invoice.business.name}</span>
              </div>
              <div className="iv-context-row">
                <span>Reference</span>
                <span>{invoice.id}</span>
              </div>
            </div>
          </section>
        </div>

        <footer className="drawer-foot iv-drawer-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
          <div className="iv-foot-actions">
            {!isSettled ? (
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={exporting}
                onClick={() => {
                  setCopied(false);
                  setActionError(null);
                  void navigator.clipboard
                    ?.writeText(new URL(`/i/${invoice.id}`, window.location.origin).toString())
                    .then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    })
                    .catch(() => setCopied(false));
                }}
              >
                <Icon icon={copied ? Check : Mail} className="ico ico-sm" />
                {copied ? "Link copied" : "Copy link"}
              </button>
            ) : null}
            <button
              className="btn btn-primary"
              type="button"
              disabled={exporting}
              aria-busy={exporting}
              onClick={handleExport}
            >
              <Icon icon={Download} className="ico ico-sm" />
              {exporting ? "Preparing…" : "Export PDF"}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
