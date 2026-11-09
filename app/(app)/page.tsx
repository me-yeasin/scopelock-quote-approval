"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  FileDiff,
  FilePlus2,
  FileText,
  FolderPlus,
  Plus,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon as LucideIconType } from "lucide-react";
import AppShell, { Icon } from "../app-shell";
import {
  FILTERS,
  STATUS_LABEL,
  type Filter,
} from "../../lib/jobs-data";
import {
  greetingFor,
  headlineMoney,
  relativeTime,
  todayLabel,
  type Dashboard,
  type DashboardActivity,
  type DashboardJobRow,
} from "../../lib/dashboard-shared";
import { useNow } from "./quotes/use-now";
import { loadDashboard } from "../overview-actions";

/* ------------------------------------------------------------------
   Overview.

   Every figure here is derived from the real documents — there is no
   second copy of the totals to drift. The page has four states and each is
   built deliberately:

     loading  skeletons in the shape of the real content
     error    a retryable message, never a blank screen
     idle     no jobs yet — an explanation and one clear next step
     data     the dashboard

   The idle state matters most: a brand-new account must not see a wall of
   zeros and empty tables.
   ------------------------------------------------------------------ */

const ACTIVITY_ICON: Record<DashboardActivity["tone"], LucideIconType> = {
  agree: CircleCheck,
  decline: CircleX,
  moved: FileDiff,
  sent: Send,
  seen: Eye,
  created: FilePlus2,
  other: FileText,
};

const TONE_CLASS: Record<DashboardActivity["tone"], string> = {
  agree: "green",
  decline: "red",
  moved: "amber",
  sent: "stone",
  seen: "stone",
  created: "stone",
  other: "stone",
};

const ACTIONS: {
  title: string;
  desc: string;
  icon: LucideIconType;
  href: string;
  primary?: boolean;
}[] = [
  {
    title: "New job",
    desc: "Create a job and start a quote",
    icon: FolderPlus,
    href: "/jobs/new",
    primary: true,
  },
  { title: "New quote", desc: "Build a quote with line items", icon: FilePlus2, href: "/jobs/new" },
  { title: "Change order", desc: "Add a change to an active job", icon: FileDiff, href: "/changes/new" },
  { title: "Invoice", desc: "Bill an approved job", icon: ReceiptText, href: "/invoices/new" },
];

export default function Home() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const result = await loadDashboard();
      if (signal?.cancelled) return;
      if (result.ok) {
        setDashboard(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch {
      if (!signal?.cancelled) setError("Could not load your overview.");
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const currency = dashboard?.primaryCurrency ?? "GBP";

  const visibleJobs = useMemo(() => {
    const rows = dashboard?.jobs ?? [];
    const needle = query.trim().toLowerCase();
    return rows.filter((job) => {
      const matchesFilter = filter === "all" || job.status === filter;
      const matchesQuery =
        !needle ||
        `${job.title} ${job.reference} ${job.city} ${job.customer} ${job.statusLabel}`
          .toLowerCase()
          .includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [dashboard, filter, query]);

  const isEmpty = !loading && dashboard?.isEmpty === true;
  const hasError = !loading && error !== null;

  /* ---------------- Headline copy ---------------- */
  const heading = useMemo(() => {
    if (isEmpty) {
      return {
        title: "Let's set up your first job.",
        lede: "Create a job, send a quote, and ScopeLock tracks every change. Nothing gets added to the price without your customer saying yes.",
      };
    }
    if (!dashboard) {
      return {
        title: "Your workspace.",
        lede: "Loading what you have on the go.",
      };
    }

    const { changesAwaiting, quotesAwaiting } = dashboard.counts;
    const parts: string[] = [];
    if (changesAwaiting > 0) {
      parts.push(
        `${changesAwaiting} change ${changesAwaiting === 1 ? "order is" : "orders are"} waiting on ${
          changesAwaiting === 1 ? "a customer" : "customers"
        }`,
      );
    }
    if (quotesAwaiting > 0) {
      parts.push(
        `${quotesAwaiting} ${quotesAwaiting === 1 ? "quote is" : "quotes are"} out for approval`,
      );
    }

    return {
      title: "Your workspace.",
      lede:
        parts.length > 0
          ? `${parts.join(", and ")}. Lock the scope before the invoice goes out.`
          : "Everything is agreed and nothing is waiting. New work starts with a job.",
    };
  }, [dashboard, isEmpty]);

  return (
    <AppShell
      activeNav="overview"
      breadcrumb={<span className="crumb-current">Overview</span>}
      query={query}
      onQueryChange={setQuery}
      searchRef={searchRef}
    >
      <div className="page">
        {/* ---------------- Page heading ---------------- */}
        <section className="page-head">
          <div className="page-head-copy">
            {todayLabel(now) ? (
              <p className="eyebrow">
                <span className="eyebrow-dot" aria-hidden="true" />
                {todayLabel(now)}
              </p>
            ) : (
              <p className="eyebrow">
                <span className="eyebrow-dot" aria-hidden="true" />
                Overview
              </p>
            )}
            <h1>
              {greetingFor(now)}
              <em>.</em>
            </h1>
            <p className="lede">{heading.lede}</p>
          </div>

          <div className="page-actions">
            {/* The idle state already leads with "Create your first job";
                repeating the same button in the header would be noise. */}
            {isEmpty ? null : (
              <Link href="/jobs/new" className="btn btn-primary">
                <Icon icon={Plus} className="ico ico-sm" />
                New job
              </Link>
            )}
          </div>
        </section>

        {hasError ? (
          <div className="inline-error" role="alert">
            <Icon icon={TriangleAlert} className="ico ico-sm" />
            <span>{error}</span>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              <Icon icon={RefreshCw} className="ico ico-sm" />
              Retry
            </button>
          </div>
        ) : null}

        {isEmpty ? (
          /* ---------------- Idle state ---------------- */
          <section className="ov-idle">
            <div className="ov-idle-card">
              <span className="ov-idle-mark">
                <Icon icon={ShieldCheck} />
              </span>
              <h2>Nothing here yet</h2>
              <p>
                You have no jobs on record. Everything else — quotes, change orders and
                invoices — hangs off a job, so that is where to begin.
              </p>

              <ol className="ov-steps">
                <li>
                  <span className="ov-step-num">1</span>
                  <div>
                    <strong>Create a job</strong>
                    <span>Who it is for, where it is, and what needs doing.</span>
                  </div>
                </li>
                <li>
                  <span className="ov-step-num">2</span>
                  <div>
                    <strong>Send a quote</strong>
                    <span>Your customer approves it with one link. No account needed.</span>
                  </div>
                </li>
                <li>
                  <span className="ov-step-num">3</span>
                  <div>
                    <strong>Track every change</strong>
                    <span>Extra work becomes a change order, and only when agreed.</span>
                  </div>
                </li>
              </ol>

              <Link href="/jobs/new" className="btn btn-primary">
                <Icon icon={Plus} className="ico ico-sm" />
                Create your first job
              </Link>
            </div>

            <div className="ov-idle-side">
              <section className="panel">
                <div className="panel-head">
                  <div className="panel-title-wrap">
                    <h2>Quick actions</h2>
                  </div>
                </div>
                <div className="ov-action-list">
                  {/* A change order needs an approved quote and an invoice needs
                      one too, so in an empty workspace only the first two are
                      reachable. Showing the others would be a dead end dressed
                      up as an action. */}
                  {ACTIONS.slice(0, 2).map((action) => (
                    <Link
                      key={action.title}
                      href={action.href}
                      className={`ov-action${action.primary ? " is-primary" : ""}`}
                    >
                      <span className="ov-action-ico">
                        <Icon icon={action.icon} className="ico ico-sm" />
                      </span>
                      <span className="ov-action-copy">
                        <span className="ov-action-title">{action.title}</span>
                        <span className="ov-action-desc">{action.desc}</span>
                      </span>
                      <Icon icon={ArrowUpRight} className="ico ico-xs" />
                    </Link>
                  ))}
                </div>
                <p className="ov-action-note">
                  Change orders and invoices unlock once a quote is approved.
                </p>
              </section>
            </div>
          </section>
        ) : (
          <>
            {/* ---------------- Stats ---------------- */}
            <section className="stats" aria-label="Key numbers" aria-busy={loading}>
              <StatCard
                label="Jobs"
                icon={Briefcase}
                tone="pine"
                loading={loading}
                value={String(dashboard?.counts.jobs ?? 0)}
                foot={
                  loading
                    ? null
                    : dashboard && dashboard.counts.jobsInProgress > 0
                      ? `${dashboard.counts.jobsInProgress} in progress`
                      : "None in progress"
                }
              />
              <StatCard
                label="Pending changes"
                icon={FileDiff}
                tone="amber"
                loading={loading}
                value={String(dashboard?.counts.changesAwaiting ?? 0)}
                foot={
                  loading
                    ? null
                    : dashboard && dashboard.counts.changesAwaiting > 0
                      ? "awaiting approval"
                      : "nothing waiting"
                }
              />
              <StatCard
                label="Scope protected"
                icon={ShieldCheck}
                tone="green"
                loading={loading}
                value={
                  headlineMoney(dashboard?.money.protectedChanges ?? {}, currency).value
                }
                foot={
                  loading
                    ? null
                    : `${dashboard?.protectedCount ?? 0} approved change${
                        dashboard?.protectedCount === 1 ? "" : "s"
                      } this month`
                }
              />
              <StatCard
                label="Invoiced"
                icon={ReceiptText}
                tone="blue"
                loading={loading}
                value={headlineMoney(dashboard?.money.outstanding ?? {}, currency).value}
                foot={
                  loading
                    ? null
                    : dashboard && dashboard.counts.invoicesOverdue > 0
                      ? `${dashboard.counts.invoicesOverdue} overdue`
                      : "outstanding"
                }
                footTone={
                  dashboard && dashboard.counts.invoicesOverdue > 0 ? "danger" : undefined
                }
              />
            </section>

            {/* ---------------- Quick actions ---------------- */}
            <section className="quick">
              <div className="section-label">
                <h2>Quick actions</h2>
                <span className="hairline" aria-hidden="true" />
              </div>

              <div className="actions">
                {ACTIONS.map((action) => (
                  <Link
                    key={action.title}
                    href={action.href}
                    className={`action${action.primary ? " action-primary" : ""}`}
                  >
                    <span className="action-icon">
                      <Icon icon={action.icon} />
                    </span>
                    <span className="action-copy">
                      <span className="action-title">{action.title}</span>
                      <span className="action-desc">{action.desc}</span>
                    </span>
                    <span className="action-go">
                      <Icon icon={ArrowUpRight} className="ico ico-sm" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* ---------------- Content ---------------- */}
            <div className="content">
              <section className="panel panel-jobs">
                <div className="panel-head">
                  <div className="panel-title-wrap">
                    <h2>Recent jobs</h2>
                    <span className="count">
                      {loading ? (
                        <span className="sk sk-count" aria-hidden="true" />
                      ) : (
                        (dashboard?.counts.jobs ?? 0)
                      )}
                    </span>
                  </div>

                  <div className="panel-tools">
                    <div className="segmented" role="group" aria-label="Filter jobs">
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
                    <Link href="/jobs" className="link">
                      View all
                      <Icon icon={ArrowUpRight} className="ico ico-xs" />
                    </Link>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th scope="col">Job</th>
                        <th scope="col">Customer</th>
                        <th scope="col" className="t-right">
                          Quote
                        </th>
                        <th scope="col" className="t-right">
                          Changes
                        </th>
                        <th scope="col" className="t-right">
                          Total
                        </th>
                        <th scope="col">Status</th>
                        <th scope="col" className="t-right">
                          Updated
                        </th>
                      </tr>
                    </thead>
                    <tbody aria-busy={loading}>
                      {loading ? (
                        Array.from({ length: 4 }, (_, row) => (
                          <tr key={row} className="skeleton-row" aria-hidden="true">
                            <td>
                              <span className="sk sk-title" />
                              <span className="sk sk-sub" />
                            </td>
                            <td>
                              <span className="sk sk-text" style={{ width: 80 }} />
                            </td>
                            <td className="t-right">
                              <span className="sk sk-num" />
                            </td>
                            <td className="t-right">
                              <span className="sk sk-num" />
                            </td>
                            <td className="t-right">
                              <span className="sk sk-num" />
                            </td>
                            <td>
                              <span className="sk sk-pill" />
                            </td>
                            <td className="t-right">
                              <span className="sk sk-text" style={{ width: 44 }} />
                            </td>
                          </tr>
                        ))
                      ) : visibleJobs.length === 0 ? (
                        <tr className="empty-row">
                          <td colSpan={7}>
                            {(dashboard?.jobs.length ?? 0) === 0
                              ? "No jobs yet."
                              : "No jobs match this filter."}
                          </td>
                        </tr>
                      ) : (
                        visibleJobs.map((job) => (
                          <tr key={job.reference} data-status={job.status}>
                            <td className="cell-job">
                              <div className="job-title">{job.title}</div>
                              <div className="job-sub">
                                #{job.reference} <span className="sep-dot" /> {job.city}
                              </div>
                            </td>
                            <td>
                              <span className="customer">
                                <span className="avatar">{job.initials}</span>
                                {job.customer || "—"}
                              </span>
                            </td>
                            <td className="t-right num">{job.quoteLabel}</td>
                            <td className="t-right">
                              <span className={`change ${job.changeTone}`}>{job.changeLabel}</span>
                            </td>
                            <td className="t-right">
                              <span className="total num">{job.totalLabel}</span>
                            </td>
                            <td>
                              <span
                                className={`status status-${
                                  job.status === "inprogress" ? "progress" : job.status
                                }`}
                              >
                                <span className="status-dot" />
                                {job.statusLabel}
                              </span>
                            </td>
                            <td className="t-right cell-time">{job.updatedLabel}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="panel-foot">
                  <span className="foot-note">
                    {loading
                      ? "Loading…"
                      : `Showing ${visibleJobs.length} of ${dashboard?.counts.jobs ?? 0} jobs`}
                  </span>
                  <Link href="/jobs" className="link">
                    Open jobs board
                    <Icon icon={ArrowRight} className="ico ico-xs" />
                  </Link>
                </div>
              </section>

              <aside className="rail">
                <ScopeBlock dashboard={dashboard} loading={loading} currency={currency} />

                <section className="panel panel-activity">
                  <div className="panel-head">
                    <div className="panel-title-wrap">
                      <h2>Recent activity</h2>
                    </div>
                    <Link href="/audit" className="link">
                      Audit log
                      <Icon icon={ArrowUpRight} className="ico ico-xs" />
                    </Link>
                  </div>

                  <ul className="activity">
                    {loading ? (
                      Array.from({ length: 3 }, (_, i) => (
                        <li className="activity-item" key={i} aria-hidden="true">
                          <span className="sk sk-icon" />
                          <div className="event-body">
                            <span className="sk sk-text" style={{ width: "80%" }} />
                            <span className="sk sk-sub" />
                          </div>
                        </li>
                      ))
                    ) : (dashboard?.activity.length ?? 0) === 0 ? (
                      <li className="activity-item is-empty">
                        <div className="event-body">
                          <p className="event-text">
                            No activity yet. Sending a quote is the first thing that shows up
                            here.
                          </p>
                        </div>
                      </li>
                    ) : (
                      dashboard!.activity.map((item) => (
                        <li className="activity-item" key={item.id}>
                          <span className={`event-icon ev-${TONE_CLASS[item.tone]}`}>
                            <Icon icon={ACTIVITY_ICON[item.tone]} className="ico ico-sm" />
                          </span>
                          <div className="event-body">
                            <p className="event-text">
                              <strong>{item.label}</strong>
                              {" — "}
                              {item.detail}
                            </p>
                            <span className="event-time">
                              {item.documentReference}
                              {relativeTime(item.at, now) ? ` · ${relativeTime(item.at, now)}` : ""}
                            </span>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------
   Stat card

   Kept small and dumb: it renders whatever it is given, including a
   skeleton, so the four cards always stay in step while loading.
   ------------------------------------------------------------------ */
function StatCard({
  label,
  icon,
  tone,
  loading,
  value,
  foot,
  footTone,
}: {
  label: string;
  icon: LucideIconType;
  tone: string;
  loading: boolean;
  value: string;
  foot: string | null;
  footTone?: "danger";
}) {
  return (
    <article className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`chip chip-${tone}`}>
          <Icon icon={icon} />
        </span>
      </div>
      <div className="stat-mid">
        {loading ? (
          <span className="sk sk-count" aria-hidden="true" />
        ) : (
          <span className="stat-value num">{value}</span>
        )}
      </div>
      <div className="stat-foot">
        {loading || !foot ? (
          <span className="sk sk-text" style={{ width: 90 }} aria-hidden="true" />
        ) : (
          <span className={`stat-note${footTone === "danger" ? " is-danger" : ""}`}>{foot}</span>
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------
   Scope protection

   The product's core claim, so it gets its own block: how much money the
   change-order flow has protected, versus how much is still exposed because
   a customer has not replied.
   ------------------------------------------------------------------ */
function ScopeBlock({
  dashboard,
  loading,
  currency,
}: {
  dashboard: Dashboard | null;
  loading: boolean;
  currency: string;
}) {
  const approved = headlineMoney(dashboard?.money.protectedChanges ?? {}, currency);
  const awaiting = headlineMoney(dashboard?.money.awaitingChanges ?? {}, currency);

  const approvedCents = dashboard?.money.protectedChanges[currency] ?? 0;
  const awaitingCents = dashboard?.money.awaitingChanges[currency] ?? 0;
  const totalCents = Math.abs(approvedCents) + Math.abs(awaitingCents);
  const approvedShare = totalCents > 0 ? (Math.abs(approvedCents) / totalCents) * 100 : 0;

  return (
    <section className="scope">
      <div className="scope-head">
        <span className="scope-icon">
          <Icon icon={ShieldCheck} />
        </span>
        <span className="scope-kicker">Scope protection</span>
        <span className="scope-badge">
          <span className="scope-badge-dot" />
          {dashboard && dashboard.awaitingCount > 0 ? "Exposed" : "Locked"}
        </span>
      </div>

      <p className="scope-label">Protected in approved changes</p>
      <p className="scope-value num">
        {loading ? <span className="sk sk-count" aria-hidden="true" /> : approved.value}
      </p>
      <p className="scope-sub">
        {loading
          ? "Loading…"
          : `Across ${dashboard?.protectedCount ?? 0} approved change${
              dashboard?.protectedCount === 1 ? "" : "s"
            }`}
      </p>

      {/* Render only the segments that actually carry money. A bar that
          always shows an amber slice suggests exposure even when nothing is
          awaiting a decision. */}
      <div className="scope-bar" aria-hidden="true">
        {Math.abs(approvedCents) > 0 ? (
          <span
            className="bar bar-approved"
            style={{ flex: `${Math.abs(approvedCents)} 0 0` }}
          />
        ) : null}
        {Math.abs(awaitingCents) > 0 ? (
          <span
            className="bar bar-awaiting"
            style={{ flex: `${Math.abs(awaitingCents)} 0 0` }}
          />
        ) : null}
        {totalCents === 0 ? <span className="bar bar-empty" /> : null}
      </div>

      <div className="scope-legend">
        <div className="legend-row">
          <span className="key key-lime" aria-hidden="true" />
          <span className="legend-name">Approved</span>
          <span className="legend-val num">{approved.value}</span>
        </div>
        <div className="legend-row">
          <span className="key key-amber" aria-hidden="true" />
          <span className="legend-name">Awaiting</span>
          <span className="legend-val num">{awaiting.value}</span>
        </div>
      </div>

      {dashboard && dashboard.awaitingCount > 0 ? (
        <Link href="/changes" className="scope-cta">
          Review {dashboard.awaitingCount} pending change
          {dashboard.awaitingCount === 1 ? "" : "s"}
          <Icon icon={ArrowRight} className="ico ico-sm" />
        </Link>
      ) : (
        <Link href="/changes" className="scope-cta is-calm">
          {dashboard && dashboard.protectedCount > 0
            ? "Nothing waiting on a customer"
            : "Raise your first change order"}
          <Icon icon={ArrowRight} className="ico ico-sm" />
        </Link>
      )}
    </section>
  );
}
