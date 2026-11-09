"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Clock,
  FileCheck2,
  FileText,
  Plus,
  Receipt,
  X,
} from "lucide-react";
import AppShell, { Icon } from "../app-shell";
import {
  QUOTE_FILTERS,
  QUOTE_STATUS_LABEL,
  SAMPLE_QUOTES,
  expiryNote,
  money,
  quoteProjected,
  quoteTotal,
  type Quote,
  type QuoteStatus,
} from "../../lib/quotes-types";
import QuoteDrawer from "./quote-drawer";
import { useNow } from "./use-now";
import "./quotes.css";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function QuotesPage() {
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Null during prerender; a real timestamp after mount.
  const now = useNow();

  const quotes = SAMPLE_QUOTES;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return quotes.filter((q) => {
      const matchesFilter = filter === "all" || q.status === filter;
      const matchesQuery =
        !needle ||
        `${q.title} ${q.id} ${q.jobReference} ${q.customer} ${q.city} ${QUOTE_STATUS_LABEL[q.status]}`
          .toLowerCase()
          .includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [quotes, filter, query]);

  const stats = useMemo(() => {
    const awaiting = quotes.filter((q) => q.status === "sent");
    const approved = quotes.filter((q) => q.status === "approved");
    const drafts = quotes.filter((q) => q.status === "draft");

    const awaitingValue = awaiting.reduce((sum, q) => sum + quoteTotal(q), 0);
    const approvedValue = approved.reduce((sum, q) => sum + quoteProjected(q), 0);
    const acceptance =
      approved.length + quotes.filter((q) => q.status === "rejected").length > 0
        ? Math.round(
            (approved.length /
              (approved.length + quotes.filter((q) => q.status === "rejected").length)) *
              100,
          )
        : 0;

    return { awaiting, approved, drafts, awaitingValue, approvedValue, acceptance };
  }, [quotes]);

  const selected = quotes.find((q) => q.id === selectedId) ?? null;

  const statusClass = (s: QuoteStatus) =>
    s === "sent" ? "sent" : s === "approved" ? "approved" : s;

  return (
    <AppShell
      activeNav="quotes"
      breadcrumb={<span className="crumb-current">Quotes</span>}
      query={query}
      onQueryChange={setQuery}
      searchRef={searchRef}
    >
      <div className="page quotes-page">
        <section className="page-head">
          <div className="page-head-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Agreed scope
            </p>
            <h1>
              Quotes
            </h1>
            <p className="lede">
              Every quote you have sent, waiting on, or locked in. Once a customer approves,
              the scope is fixed — and nothing extra gets invoiced without their say-so.
            </p>
          </div>

          <div className="page-actions">
            <Link href="/jobs/new" className="btn btn-primary">
              <Icon icon={Plus} className="ico ico-sm" />
              New quote
            </Link>
          </div>
        </section>

        {/* ---------- Stat strip ---------- */}
        <section className="q-stats" aria-label="Quote overview">
          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={Clock} className="ico ico-xs" />
              </span>
              Awaiting approval
            </div>
            <div className="q-stat-value">
              {money(stats.awaitingValue, "GBP")}
            </div>
            <div className="q-stat-note">
              {stats.awaiting.length} {stats.awaiting.length === 1 ? "quote" : "quotes"} out
              with customers
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={FileCheck2} className="ico ico-xs" />
              </span>
              Locked in
            </div>
            <div className="q-stat-value">{money(stats.approvedValue, "GBP")}</div>
            <div className="q-stat-note">
              <span className="up">{stats.approved.length} approved</span> and under way
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={Receipt} className="ico ico-xs" />
              </span>
              Acceptance rate
            </div>
            <div className="q-stat-value">{stats.acceptance}%</div>
            <div className="q-stat-note">of decided quotes were accepted</div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={FileText} className="ico ico-xs" />
              </span>
              Drafts
            </div>
            <div className="q-stat-value">{stats.drafts.length}</div>
            <div className="q-stat-note">
              {stats.drafts.length > 0 ? (
                <>
                  <span className="warn">Not sent yet</span> — ready to review
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
              <h2>All quotes</h2>
              <span className="count">{quotes.length}</span>
            </div>

            <div className="panel-tools">
              <div className="segmented" role="group" aria-label="Filter quotes">
                {QUOTE_FILTERS.map((option) => (
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
            <table className="q-table">
              <thead>
                <tr>
                  <th scope="col">Quote</th>
                  <th scope="col">Customer</th>
                  <th scope="col" className="t-right">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Valid until</th>
                  <th scope="col" className="t-right">
                    Issued
                  </th>
                  <th scope="col" aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 0, borderBottom: 0 }}>
                      <div className="q-empty">
                        <span className="q-empty-mark">
                          <Icon icon={FileText} className="ico" />
                        </span>
                        <h3>
                          {quotes.length === 0 ? "No quotes yet" : "Nothing matches this filter"}
                        </h3>
                        <p>
                          {quotes.length === 0
                            ? "Build a quote from a job to agree the scope before any work starts."
                            : "Try a different status, or clear the search to see every quote."}
                        </p>
                        {quotes.length === 0 ? (
                          <Link href="/jobs/new" className="btn btn-primary btn-sm">
                            <Icon icon={Plus} className="ico ico-sm" />
                            Create a quote
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
                  visible.map((quote) => {
                    const expiry = expiryNote(quote, now);
                    return (
                      <tr
                        key={quote.id}
                        tabIndex={0}
                        onClick={() => setSelectedId(quote.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedId(quote.id);
                          }
                        }}
                      >
                        <td>
                          <div className="q-cell-main">
                            <span className="q-title">{quote.title}</span>
                            <span className="q-sub">
                              <span className="q-ref">{quote.id}</span>
                              <span className="sep-dot" />
                              {quote.jobReference}
                              <span className="sep-dot" />
                              {quote.city}
                            </span>
                          </div>
                        </td>
                        <td>{quote.customer}</td>
                        <td className="t-right">
                          <span className="q-num q-total">
                            {money(quoteTotal(quote), quote.currency)}
                          </span>
                        </td>
                        <td>
                          <span className={`status status-${statusClass(quote.status)}`}>
                            <span className="status-dot" />
                            {QUOTE_STATUS_LABEL[quote.status]}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`q-expiry ${expiry?.tone ?? "calm"}`}
                            title={expiry?.text ?? ""}
                          >
                            {formatDate(quote.validUntil)}
                            {expiry ? ` · ${expiry.text}` : ""}
                          </span>
                        </td>
                        <td className="t-right q-num">{formatDate(quote.issuedAt)}</td>
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
              Showing {visible.length} of {quotes.length} quotes
            </span>
            <span className="q-toolbar-note">
              Quotes lock on approval — changes after that need a change order
            </span>
          </div>
        </section>
      </div>

      {selected ? (
        <QuoteDrawer key={selected.id} quote={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </AppShell>
  );
}
