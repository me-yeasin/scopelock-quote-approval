"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Plus,
  ReceiptText,
  RefreshCw,
  X,
} from "lucide-react";
import AppShell, { Icon } from "../app-shell";
import { money } from "../../lib/quotes-types";
import { useNow } from "../quotes/use-now";
import { getInvoiceStats, getInvoices, type InvoiceListRow } from "./actions";
import InvoiceDrawer from "./invoice-drawer";
import "./invoices.css";

/* ------------------------------------------------------------------
   Invoices — one live invoice per job.

   The list is a statement of account, not an archive. Every total is
   derived server-side from the approved quote plus approved change orders,
   so approving a change moves these figures with no invoice being "issued"
   again.
   ------------------------------------------------------------------ */

type Filter = "all" | "outstanding" | "overdue" | "paid" | "draft" | "void";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "outstanding", label: "Outstanding" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
  { id: "draft", label: "Draft" },
  { id: "void", label: "Void" },
];

const SKELETON_ROWS = 4;

function formatDay(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dueLabel(row: InvoiceListRow) {
  if (row.status === "paid") return { tone: "ok", text: "Paid" };
  if (row.status === "void") return { tone: "void", text: "Void" };
  if (row.status === "draft") return { tone: "calm", text: "Not sent" };
  if (row.daysOverdue > 0) {
    return {
      tone: "danger",
      text: `${row.daysOverdue} ${row.daysOverdue === 1 ? "day" : "days"} overdue`,
    };
  }
  return { tone: "calm", text: "Due" };
}

export default function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getInvoiceStats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  const refresh = useCallback(async () => {
    try {
      const [list, summary] = await Promise.all([getInvoices(), getInvoiceStats()]);
      setRows(list);
      setStats(summary);
      setLoadError(null);
    } catch {
      setLoadError("Could not load invoices. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "outstanding"
            ? row.status === "issued"
            : filter === "overdue"
              ? row.status === "issued" && row.daysOverdue > 0
              : row.status === filter;

      const matchesQuery =
        !needle ||
        `${row.reference} ${row.jobTitle} ${row.jobReference} ${row.customer} ${row.city} ${row.status}`
          .toLowerCase()
          .includes(needle);

      return matchesFilter && matchesQuery;
    });
  }, [rows, filter, query]);

  const filteredTotal = useMemo(
    () => visible.reduce((sum, row) => sum + row.totalCents, 0),
    [visible],
  );

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
              One live invoice per job. It always shows the approved quote plus every
              approved change, so what you bill can never drift from the work.
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
        <section className="q-stats" aria-label="Invoice overview" aria-busy={loading}>
          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={Clock} className="ico ico-xs" />
              </span>
              Outstanding
            </div>
            <div className="q-stat-value">
              {loading || !stats ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                money(stats.outstandingCents, "GBP")
              )}
            </div>
            <div className="q-stat-note">
              {loading || !stats ? (
                "Loading…"
              ) : (
                <>
                  {stats.outstandingCount}{" "}
                  {stats.outstandingCount === 1 ? "invoice" : "invoices"} awaiting payment
                </>
              )}
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={AlertTriangle} className="ico ico-xs" />
              </span>
              Overdue
            </div>
            <div className="q-stat-value">
              {loading || !stats ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                money(stats.overdueCents, "GBP")
              )}
            </div>
            <div className="q-stat-note">
              {loading || !stats ? (
                "Loading…"
              ) : stats.overdueCount > 0 ? (
                <>
                  <span className="danger">{stats.overdueCount} past due</span> — chase these
                </>
              ) : (
                "Nothing past its due date"
              )}
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
              {loading || !stats ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                money(stats.paidCents, "GBP")
              )}
            </div>
            <div className="q-stat-note">
              {loading || !stats ? (
                "Loading…"
              ) : (
                <>
                  <span className="up">{stats.paidCount} settled</span> and closed
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
              {loading || !stats ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                money(stats.pendingCents, "GBP")
              )}
            </div>
            <div className="q-stat-note">pending changes — never billed until agreed</div>
          </article>
        </section>

        {/* ---------- List ---------- */}
        <section className="panel panel-jobs">
          <div className="panel-head">
            <div className="panel-title-wrap">
              <h2>All invoices</h2>
              <span className="count">
                {loading ? <span className="sk sk-count" aria-hidden="true" /> : rows.length}
              </span>
            </div>

            <div className="panel-tools">
              <div className="segmented" role="group" aria-label="Filter invoices">
                {FILTERS.map((option) => (
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

          {loadError ? (
            <div className="inline-error" role="alert">
              <Icon icon={AlertTriangle} className="ico ico-sm" />
              <span>{loadError}</span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void refresh()}>
                <Icon icon={RefreshCw} className="ico ico-sm" />
                Retry
              </button>
            </div>
          ) : null}

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
                          {rows.length === 0
                            ? "No invoices yet"
                            : "Nothing matches this filter"}
                        </h3>
                        <p>
                          {rows.length === 0
                            ? "Every job gets one live invoice. Approve a quote and you can bill it here."
                            : "Try a different status, or clear the search to see every invoice."}
                        </p>
                        {rows.length === 0 ? (
                          <Link href="/invoices/new" className="btn btn-primary btn-sm">
                            <Icon icon={Plus} className="ico ico-sm" />
                            New invoice
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
                  visible.map((row) => {
                    const due = dueLabel(row);
                    return (
                      <tr
                        key={row.reference}
                        tabIndex={0}
                        onClick={() => setSelected(row.reference)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelected(row.reference);
                          }
                        }}
                      >
                        <td>
                          <div className="q-cell-main">
                            <span className="q-title">{row.reference}</span>
                            <span className="q-sub">
                              {row.jobTitle}
                              {row.pendingCents !== 0 ? (
                                <>
                                  <span className="sep-dot" />
                                  <span
                                    className="iv-live-dot"
                                    title="Pending changes — not billed"
                                  >
                                    live
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="iv-job">{row.jobReference}</span>
                        </td>
                        <td>{row.customer}</td>
                        <td className="t-right">
                          <span className="iv-num">{money(row.totalCents, row.currency)}</span>
                          {row.pendingCents !== 0 ? (
                            <span className="iv-project">
                              {money(row.totalCents + row.pendingCents, row.currency)} if approved
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className={`status status-${statusClass(row.status)}`}>
                            <span className="status-dot" />
                            {statusWord(row.status)}
                          </span>
                        </td>
                        <td>
                          <span className={`q-expiry ${due.tone}`}>
                            {formatDay(row.dueAt)}
                            {due.text !== "Due" ? ` · ${due.text}` : ""}
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
              Showing {visible.length} of {rows.length} invoices
              {visible.length > 0 ? ` · ${money(filteredTotal, "GBP")} in view` : ""}
            </span>
            <span className="q-toolbar-note">
              Totals are recalculated live — approving a change updates the invoice
            </span>
          </div>
        </section>
      </div>

      {selected ? (
        <InvoiceDrawer
          key={selected}
          reference={selected}
          onClose={() => setSelected(null)}
          onChanged={() => void refresh()}
        />
      ) : null}
    </AppShell>
  );
}

function statusClass(status: InvoiceListRow["status"]) {
  if (status === "issued") return "sent";
  return status;
}

function statusWord(status: InvoiceListRow["status"]) {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Paid";
  if (status === "void") return "Void";
  return "Draft";
}
