"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Clock,
  FileDiff,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import AppShell, { Icon } from "../app-shell";
import {
  CHANGE_FILTERS,
  CHANGE_KIND_LABEL,
  CHANGE_STATUS_LABEL,
  changeIsCredit,
  changeNet,
  changeNewTotal,
  type ChangeKind,
  type ChangeOrder,
  type ChangeOrderStatus,
} from "../../lib/changes-types";
import { money } from "../../lib/quotes-types";
import { getChanges } from "./actions";
import ChangeDrawer from "./change-drawer";
import "./changes.css";

/* ------------------------------------------------------------------
   Change Orders — the ledger of everything that moved the price after
   the quote was agreed.

   The screen answers one question first: "what has changed, and did the
   customer agree to it?" Every row therefore shows the signed effect on
   the price (plus or minus) before anything else, and approved rows are
   the only ones counted as billable.
   ------------------------------------------------------------------ */

const SKELETON_ROWS = 5;

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Signed money, so a credit reads as "-£185.00" with no ambiguity. */
function signed(cents: number, currency: "GBP" | "EUR") {
  if (cents === 0) return money(0, currency);
  const abs = Math.abs(cents);
  return cents > 0 ? `+${money(abs, currency)}` : `−${money(abs, currency)}`;
}

const KIND_TONE: Record<ChangeKind, string> = {
  "extra-work": "add",
  variation: "add",
  omission: "credit",
  materials: "add",
  delay: "delay",
};

export default function ChangesPage() {
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChangeOrderStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await getChanges();
    if (result.ok) {
      setOrders(result.changes);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesFilter = filter === "all" || order.status === filter;
      const matchesQuery =
        !needle ||
        `${order.id} ${order.jobTitle} ${order.jobReference} ${order.customer} ${order.summary} ${CHANGE_KIND_LABEL[order.kind]} ${CHANGE_STATUS_LABEL[order.status]}`
          .toLowerCase()
          .includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [orders, filter, query]);

  const stats = useMemo(() => {
    const awaiting = orders.filter((o) => o.status === "sent");
    const approved = orders.filter((o) => o.status === "approved");
    const drafts = orders.filter((o) => o.status === "draft");

    // Only approved changes are billable — pending money is not counted.
    const approvedUplift = approved.reduce((sum, o) => sum + changeNet(o), 0);
    const awaitingValue = awaiting.reduce((sum, o) => sum + changeNet(o), 0);

    // Distinct jobs that carry at least one approved change.
    const jobsMoved = new Set(approved.map((o) => o.jobReference)).size;

    return { awaiting, approved, drafts, approvedUplift, awaitingValue, jobsMoved };
  }, [orders]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  const statusClass = (s: ChangeOrderStatus) =>
    s === "sent" ? "sent" : s === "approved" ? "approved" : s;

  return (
    <AppShell
      activeNav="changes"
      breadcrumb={<span className="crumb-current">Change orders</span>}
      query={query}
      onQueryChange={setQuery}
      searchRef={searchRef}
    >
      <div className="page changes-page">
        <section className="page-head">
          <div className="page-head-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Post-approval scope
            </p>
            <h1>Change orders</h1>
            <p className="lede">
              The approved quote is the baseline. Anything that moves after that lives
              here — priced, sent, and approved in writing before you lift a finger.
            </p>
          </div>

          <div className="page-actions">
            <Link href="/changes/new" className="btn btn-primary">
              <Icon icon={Plus} className="ico ico-sm" />
              New change order
            </Link>
          </div>
        </section>

        {loadError ? (
          <div className="jobs-banner" role="alert">
            <Icon icon={X} className="ico ico-sm" />
            <span>
              Could not load change orders — {loadError}
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                style={{ marginLeft: 10 }}
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                Retry
              </button>
            </span>
          </div>
        ) : null}

        {/* ---------- Stat strip ---------- */}
        <section className="q-stats" aria-label="Change order overview">
          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={ShieldCheck} className="ico ico-xs" />
              </span>
              Agreed additions
            </div>
            <div className="q-stat-value">
              {loading ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                <span className={stats.approvedUplift < 0 ? "ch-neg" : undefined}>
                  {signed(stats.approvedUplift, "GBP")}
                </span>
              )}
            </div>
            <div className="q-stat-note">
              {loading ? (
                "Loading…"
              ) : (
                <>
                  approved on <span className="up">{stats.jobsMoved}</span>{" "}
                  {stats.jobsMoved === 1 ? "job" : "jobs"} — billable
                </>
              )}
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={Clock} className="ico ico-xs" />
              </span>
              Awaiting approval
            </div>
            <div className="q-stat-value">
              {loading ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                <span className={stats.awaitingValue < 0 ? "ch-neg" : undefined}>
                  {signed(stats.awaitingValue, "GBP")}
                </span>
              )}
            </div>
            <div className="q-stat-note">
              {loading
                ? "Loading…"
                : `${stats.awaiting.length} not yet agreed — nothing billable`}
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={FileDiff} className="ico ico-xs" />
              </span>
              Approved
            </div>
            <div className="q-stat-value">
              {loading ? (
                <span className="sk sk-count" aria-hidden="true" />
              ) : (
                stats.approved.length
              )}
            </div>
            <div className="q-stat-note">
              {loading ? "Loading…" : "in writing, before the work started"}
            </div>
          </article>

          <article className="q-stat">
            <div className="q-stat-top">
              <span className="q-stat-ico">
                <Icon icon={FileDiff} className="ico ico-xs" />
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
              <h2>All change orders</h2>
              <span className="count">
                {loading ? <span className="sk sk-count" aria-hidden="true" /> : orders.length}
              </span>
            </div>

            <div className="panel-tools">
              <div className="segmented" role="group" aria-label="Filter change orders">
                {CHANGE_FILTERS.map((option) => (
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
            <table className="ch-table">
              <thead>
                <tr>
                  <th scope="col">Change</th>
                  <th scope="col">Job</th>
                  <th scope="col">Customer</th>
                  <th scope="col" className="t-right">
                    Effect
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" className="t-right">
                    Raised
                  </th>
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
                      <td className="t-right">
                        <span className="sk sk-num" style={{ width: 44 }} />
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
                          <Icon icon={FileDiff} className="ico" />
                        </span>
                        <h3>
                          {orders.length === 0
                            ? "No change orders yet"
                            : "Nothing matches this filter"}
                        </h3>
                        <p>
                          {orders.length === 0
                            ? "When something changes after the quote is approved, raise a change order so the extra work is agreed — and paid."
                            : "Try a different status, or clear the search to see every change."}
                        </p>
                        {orders.length === 0 ? (
                          <Link href="/changes/new" className="btn btn-primary btn-sm">
                            <Icon icon={Plus} className="ico ico-sm" />
                            Raise a change order
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
                  visible.map((order) => {
                    const net = changeNet(order);
                    const credit = changeIsCredit(order);
                    return (
                      <tr
                        key={order.id}
                        tabIndex={0}
                        onClick={() => setSelectedId(order.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedId(order.id);
                          }
                        }}
                      >
                        <td>
                          <div className="q-cell-main">
                            <span className="q-title">{order.summary}</span>
                            <span className="q-sub">
                              <span className="q-ref">{order.id}</span>
                              <span className="sep-dot" />
                              <span className={`ch-kind ch-kind-${KIND_TONE[order.kind]}`}>
                                {CHANGE_KIND_LABEL[order.kind]}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="q-cell-main">
                            <span className="ch-job">{order.jobTitle}</span>
                            <span className="q-sub">{order.jobReference}</span>
                          </div>
                        </td>
                        <td>{order.customer}</td>
                        <td className="t-right">
                          <span className={`ch-num ${credit ? "ch-neg" : "ch-pos"}`}>
                            <Icon
                              icon={credit ? ArrowDownRight : ArrowUpRight}
                              className="ico ico-xs"
                            />
                            {signed(net, order.currency)}
                          </span>
                          <span className="ch-baseline">
                            on {money(order.baselineCents, order.currency)}
                          </span>
                        </td>
                        <td>
                          <span className={`status status-${statusClass(order.status)}`}>
                            <span className="status-dot" />
                            {CHANGE_STATUS_LABEL[order.status]}
                          </span>
                        </td>
                        <td className="t-right q-num">{formatDate(order.issuedAt)}</td>
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
              Showing {visible.length} of {orders.length} change orders
            </span>
            <span className="q-toolbar-note">
              Only approved changes are billable — the quote stays the baseline
            </span>
          </div>
        </section>
      </div>

      {selected ? (
        <ChangeDrawer
          key={selected.id}
          order={selected}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </AppShell>
  );
}
