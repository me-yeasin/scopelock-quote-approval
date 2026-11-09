"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Plus,
  ReceiptText,
  X,
} from "lucide-react";
import AppShell, { Icon } from "../app-shell";
import {
  INVOICE_FILTERS,
  INVOICE_STATUS_LABEL,
  dueNote,
  invoiceProjected,
  invoiceTotal,
  type Invoice,
  type InvoiceStatus,
} from "../../lib/invoices-types";
import { INVOICES } from "../../lib/invoices-data";
import { money } from "../../lib/quotes-types";
import { useNow } from "../quotes/use-now";
import InvoiceDrawer from "./invoice-drawer";
import "./invoices.css";

/* ------------------------------------------------------------------
   Invoices — one live invoice per job.

   The list is a statement of account, not a document archive: every row
   reads the job's *current* total, so an approved change order moves the
   figure here without anyone issuing anything.
   ------------------------------------------------------------------ */

const SKELETON_ROWS = 5;

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function InvoicesPage() {
  const [invoices] = useState<Invoice[]>(INVOICES);
  const loading = false;
  const [filter, setFilter] = useState<InvoiceStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesFilter = filter === "all" || invoice.status === filter;
      const matchesQuery =
        !needle ||
        `${invoice.id} ${invoice.jobTitle} ${invoice.jobReference} ${invoice.customer} ${invoice.city} ${INVOICE_STATUS_LABEL[invoice.status]}`
          .toLowerCase()
          .includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [invoices, filter, query]);

  const stats = useMemo(() => {
    const outstanding = invoices.filter((i) => i.status === "issued");
    const paid = invoices.filter((i) => i.status === "paid");
    const drafts = invoices.filter((i) => i.status === "draft");

    return {
      outstanding,
      paid,
      drafts,
      outstandingValue: outstanding.reduce((sum, i) => sum + invoiceTotal(i), 0),
      paidValue: paid.reduce((sum, i) => sum + invoiceTotal(i), 0),
      // Money that would join an invoice if pending changes were approved.
      pendingValue: invoices.reduce((sum, i) => sum + i.pendingChangesCents, 0),
    };
  }, [invoices]);

  const selected = invoices.find((i) => i.id === selectedId) ?? null;

  const statusClass = (s: InvoiceStatus) => (s === "issued" ? "sent" : s);

  return (
    <AppShell
      activeNav="invoices"
      breadcrumb={<span className="crumb-current">Invoices</span>}
      query={query}
      onQueryChange={setQuery}
      searchRef={searchRef}
    >
      <div className="page invoices-page">
        <section className="page-head">
          <div className="page-head-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Statement of account
            </p>
            <h1>Invoices</h1>
            <p className="lede">
              One live invoice per job. It always shows the agreed quote plus every
              approved change — so what you bill can never drift from the work.
            </p>
          </div>

          <div className="page-actions">
            <Link href="/invoices/new" className="btn btn-primary">
              <Icon icon={Plus} className="ico ico-sm" />
              New invoice
            </Link>
          </div>
        </section>

        {/* ---------- Stat strip ---------- */}
        <section className="q-stats" aria-label="Invoice overview">
          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={Clock} className="ico ico-xs" />
              </span>
              Outstanding
            </div>
            <div className="q-stat-value">
              {loading ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                money(stats.outstandingValue, "GBP")
              )}
            </div>
            <div className="q-stat-note">
              {loading
                ? "Loading…"
                : `${stats.outstanding.length} ${stats.outstanding.length === 1 ? "invoice" : "invoices"} awaiting payment`}
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={CheckCircle2} className="ico ico-xs" />
              </span>
              Paid
            </div>
            <div className="q-stat-value">
              {loading ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                money(stats.paidValue, "GBP")
              )}
            </div>
            <div className="q-stat-note">
              {loading ? (
                "Loading…"
              ) : (
                <>
                  <span className="up">{stats.paid.length} settled</span> and closed
                </>
              )}
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={ReceiptText} className="ico ico-xs" />
              </span>
              Not yet approved
            </div>
            <div className="q-stat-value">
              {loading ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                money(stats.pendingValue, "GBP")
              )}
            </div>
            <div className="q-stat-note">
              pending changes — never billed until agreed
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={FileText} className="ico ico-xs" />
              </span>
              Drafts
            </div>
            <div className="q-stat-value">
              {loading ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                stats.drafts.length
              )}
            </div>
            <div className="q-stat-note">
              {loading ? (
                "Loading…"
              ) : stats.drafts.length > 0 ? (
                <>
                  <span className="warn">Not sent</span> — customers cannot see these
                </>
              ) : (
                "Nothing waiting to be sent"
              )}
            </div>
          </article>
        </section>

        {/* ---------- List ---------- */}
        <section className="panel panel-jobs">
          <div className="panel-head">
            <div className="panel-title-wrap">
              <h2>All invoices</h2>
              <span className="count">
                {loading ? <span className="sk sk-count" aria-hidden="true" /> : invoices.length}
              </span>
            </div>

            <div className="panel-tools">
              <div className="segmented" role="group" aria-label="Filter invoices">
                {INVOICE_FILTERS.map((option) => (
                  <button
                    key={option.id}
                    className={`seg${filter === option.id ? " is-active" : ""}`}
                    type="button"
                    aria-pressed={filter === option.id}
                    onClick={() => setFilter(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="q-table iv-table">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Job</th>
                  <th scope="col">Customer</th>
                  <th scope="col" className="t-right">
                    Total
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Due</th>
                  <th scope="col" aria-label="Open" />
                </tr>
              </thead>
              <tbody aria-busy={loading}>
                {loading ? (
                  Array.from({ length: SKELETON_ROWS }, (_, row) => (
                    <tr
                      key={row}
                      className="skeleton-row"
                      style={{ "--row": row } as CSSProperties}
                      aria-hidden="true"
                    >
                      <td>
                        <span className="sk sk-title" />
                        <span className="sk sk-sub" />
                      </td>
                      <td>
                        <span className="sk sk-text" style={{ width: 92 }} />
                      </td>
                      <td>
                        <span className="sk sk-text" style={{ width: 70 }} />
                      </td>
                      <td className="t-right">
                        <span className="sk sk-num" />
                      </td>
                      <td>
                        <span className="sk sk-pill" />
                      </td>
                      <td>
                        <span className="sk sk-text" style={{ width: 60 }} />
                      </td>
                      <td className="t-right">
                        <span className="sk sk-icon" />
                      </td>
                    </tr>
                  ))
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 0, borderBottom: 0 }}>
                      <div className="q-empty">
                        <span className="q-empty-mark">
                          <Icon icon={ReceiptText} className="ico" />
                        </span>
                        <h3>
                          {invoices.length === 0
                            ? "No invoices yet"
                            : "Nothing matches this filter"}
                        </h3>
                        <p>
                          {invoices.length === 0
                            ? "Every job gets one live invoice. Approve a quote and it appears here, ready to send."
                            : "Try a different status, or clear the search to see every invoice."}
                        </p>
                        {invoices.length === 0 ? (
                          <Link href="/jobs/new" className="btn btn-primary btn-sm">
                            <Icon icon={Plus} className="ico ico-sm" />
                            Create a job
                          </Link>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => {
                              setFilter("all");
                              setQuery("");
                            }}
                          >
                            <Icon icon={X} className="ico ico-sm" />
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visible.map((invoice) => {
                    const due = dueNote(invoice, now);
                    return (
                      <tr
                        key={invoice.id}
                        tabIndex={0}
                        onClick={() => setSelectedId(invoice.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedId(invoice.id);
                          }
                        }}
                      >
                        <td>
                          <div className="q-cell-main">
                            <span className="q-title">{invoice.id}</span>
                            <span className="q-sub">
                              {invoice.jobTitle}
                              {invoice.pendingChangesCents > 0 ? (
                                <>
                                  <span className="sep-dot" />
                                  <span className="iv-live-dot" title="Live — pending changes exist">
                                    live
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="iv-job">{invoice.jobReference}</span>
                        </td>
                        <td>{invoice.customer}</td>
                        <td className="t-right">
                          <span className="iv-num">{money(invoiceTotal(invoice), invoice.currency)}</span>
                          {invoice.pendingChangesCents > 0 ? (
                            <span className="iv-project">
                              {money(invoiceProjected(invoice), invoice.currency)} if approved
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className={`status status-${statusClass(invoice.status)}`}>
                            <span className="status-dot" />
                            {INVOICE_STATUS_LABEL[invoice.status]}
                          </span>
                        </td>
                        <td>
                          <span className={`q-expiry ${due?.tone ?? "calm"}`} title={due?.text ?? ""}>
                            {formatDate(invoice.dueAt)}
                            {due ? ` · ${due.text}` : ""}
                          </span>
                        </td>
                        <td className="t-right">
                          <Icon icon={ChevronRight} className="ico ico-sm q-chevron" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="panel-foot">
            <span className="foot-note">
              Showing {visible.length} of {invoices.length} invoices
            </span>
            <span className="q-toolbar-note">
              Live — approving a change updates the invoice automatically
            </span>
          </div>
        </section>
      </div>

      {selected ? (
        <InvoiceDrawer
          key={selected.id}
          invoice={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </AppShell>
  );
}
