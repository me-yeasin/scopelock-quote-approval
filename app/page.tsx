"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Calendar,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  FileDiff,
  FilePlus2,
  FolderPlus,
  Plus,
  ReceiptText,
  Send,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import AppShell, { Icon } from "./app-shell";
import {
  JOBS,
  STATUS_LABEL,
  FILTERS,
  type ChangeTone,
  type Filter,
  type StatusKey,
} from "../lib/jobs-data";

/* ------------------------------------------------------------------
   Data
   ------------------------------------------------------------------ */
const STATS: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: string;
  delta: string;
  deltaIcon: LucideIcon;
  deltaTone: string;
  note: string;
  line: string;
  sparkClass: string;
}[] = [
  {
    label: "Total jobs",
    value: "12",
    icon: Briefcase,
    tone: "pine",
    delta: "4",
    deltaIcon: TrendingUp,
    deltaTone: "up",
    note: "vs last month",
    line: "M1 20 11 16 21 17 31 12 41 13 51 8 63 6",
    sparkClass: "",
  },
  {
    label: "Pending changes",
    value: "3",
    icon: FileDiff,
    tone: "amber",
    delta: "3",
    deltaIcon: Clock,
    deltaTone: "wait",
    note: "awaiting approval",
    line: "M1 10 11 13 21 9 31 15 41 11 51 14 63 12",
    sparkClass: "spark-amber",
  },
  {
    label: "Approved this month",
    value: "£8,450",
    icon: CircleCheck,
    tone: "green",
    delta: "12%",
    deltaIcon: TrendingUp,
    deltaTone: "up",
    note: "vs last month",
    line: "M1 22 11 19 21 20 31 14 41 16 51 9 63 5",
    sparkClass: "spark-green",
  },
  {
    label: "Invoiced",
    value: "£14,200",
    icon: ReceiptText,
    tone: "blue",
    delta: "22%",
    deltaIcon: TrendingUp,
    deltaTone: "up",
    note: "vs last month",
    line: "M1 21 11 20 21 15 31 17 41 10 51 11 63 4",
    sparkClass: "spark-blue",
  },
];

const ACTIONS: {
  title: string;
  desc: string;
  icon: LucideIcon;
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
  {
    title: "New quote",
    desc: "Build a quote with line items",
    icon: FilePlus2,
    href: "/jobs/new",
  },
  { title: "Change order", desc: "Add a change to an active job", icon: FileDiff, href: "#" },
  { title: "Invoice", desc: "Generate a PDF invoice", icon: ReceiptText, href: "#" },
];

const ACTIVITY: { icon: LucideIcon; tone: string; node: ReactNode; time: string }[] = [
  {
    icon: CircleCheck,
    tone: "green",
    node: (
      <>
        <strong>M. Harris</strong> approved the quote for <strong>Bathroom renovation</strong>
      </>
    ),
    time: "2 hours ago",
  },
  {
    icon: FileDiff,
    tone: "amber",
    node: (
      <>
        <strong>S. Patel</strong> requested a change on <strong>Kitchen tap replacement</strong>
      </>
    ),
    time: "5 hours ago",
  },
  {
    icon: ReceiptText,
    tone: "blue",
    node: (
      <>
        Invoice <strong>#INV-2026-031</strong> generated for <strong>Boiler service</strong>
      </>
    ),
    time: "1 day ago",
  },
  {
    icon: CircleX,
    tone: "red",
    node: (
      <>
        Change order rejected on <strong>Radiator install</strong> — £50 voided
      </>
    ),
    time: "2 days ago",
  },
  {
    icon: Send,
    tone: "stone",
    node: (
      <>
        Quote sent to <strong>R. Okafor</strong> for <strong>External painting</strong>
      </>
    ),
    time: "3 days ago",
  },
];

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */
export default function Home() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const visibleJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return JOBS.filter((job) => {
      const matchesFilter = filter === "all" || job.status === filter;
      const matchesQuery =
        !needle ||
        `${job.title} ${job.id} ${job.city} ${job.customer} ${STATUS_LABEL[job.status]}`
          .toLowerCase()
          .includes(needle);

      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  return (
    <AppShell
      activeNav="overview"
      breadcrumb={<span className="crumb-current">Overview</span>}
      query={query}
      onQueryChange={setQuery}
      searchRef={searchRef}
    >
      <div className="page">
        {/* Page heading */}
        <section className="page-head">
          <div className="page-head-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Saturday, 7 November
            </p>
            <h1>
              Good morning, <em>James</em>.
            </h1>
            <p className="lede">
              Three change orders are waiting on your customers. Lock the scope before the
              invoice goes out.
            </p>
          </div>

          <div className="page-actions">
            <button className="btn btn-ghost" type="button">
              <Icon icon={Calendar} className="ico ico-sm" />
              This month
              <Icon icon={ChevronDown} className="ico ico-xs" />
            </button>
            <Link href="/jobs/new" className="btn btn-primary">
              <Icon icon={Plus} className="ico ico-sm" />
              New job
            </Link>
          </div>
        </section>

        {/* Stats */}
        <section className="stats" aria-label="Key numbers">
          {STATS.map((stat) => (
            <article className="stat" key={stat.label}>
              <div className="stat-top">
                <span className="stat-label">{stat.label}</span>
                <span className={`chip chip-${stat.tone}`}>
                  <Icon icon={stat.icon} />
                </span>
              </div>
              <div className="stat-mid">
                <span className="stat-value num">{stat.value}</span>
                <svg className={`spark ${stat.sparkClass}`} viewBox="0 0 64 26" fill="none" aria-hidden="true">
                  <path d={`${stat.line} 63 26 1 26Z`} fill="currentColor" opacity=".07" />
                  <path
                    d={stat.line}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="stat-foot">
                <span className={`delta delta-${stat.deltaTone}`}>
                  <Icon icon={stat.deltaIcon} className="ico ico-xs" />
                  {stat.delta}
                </span>
                <span className="stat-note">{stat.note}</span>
              </div>
            </article>
          ))}
        </section>

        {/* Quick actions */}
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

        {/* Content */}
        <div className="content">
          <section className="panel panel-jobs">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <h2>Recent jobs</h2>
                <span className="count">{JOBS.length}</span>
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
                <a href="#" className="link">
                  View all
                  <Icon icon={ArrowUpRight} className="ico ico-xs" />
                </a>
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
                <tbody id="jobsBody">
                  {visibleJobs.map((job) => (
                    <tr key={job.id} data-status={job.status}>
                      <td className="cell-job">
                        <div className="job-title">{job.title}</div>
                        <div className="job-sub">
                          #{job.id} <span className="sep-dot" /> {job.city}
                        </div>
                      </td>
                      <td>
                        <span className="customer">
                          <span className="avatar">{job.initials}</span>
                          {job.customer}
                        </span>
                      </td>
                      <td className="t-right num">{job.quote}</td>
                      <td className="t-right">
                        <span className={`change ${job.changeTone}`}>{job.change}</span>
                      </td>
                      <td className="t-right">
                        <span className="total num">{job.total}</span>
                      </td>
                      <td>
                        <span
                          className={`status status-${
                            job.status === "inprogress" ? "progress" : job.status
                          }`}
                        >
                          <span className="status-dot" />
                          {STATUS_LABEL[job.status]}
                        </span>
                      </td>
                      <td className="t-right cell-time">{job.updated}</td>
                    </tr>
                  ))}

                  {visibleJobs.length === 0 ? (
                    <tr className="empty-row">
                      <td colSpan={7}>No jobs match this filter.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="panel-foot">
              <span className="foot-note">Showing {visibleJobs.length} of 12 jobs</span>
              <a href="#" className="link">
                Open jobs board
                <Icon icon={ArrowRight} className="ico ico-xs" />
              </a>
            </div>
          </section>

          <aside className="rail">
            <section className="scope">
              <div className="scope-head">
                <span className="scope-icon">
                  <Icon icon={ShieldCheck} />
                </span>
                <span className="scope-kicker">Scope protection</span>
                <span className="scope-badge">
                  <span className="scope-badge-dot" />
                  Locked
                </span>
              </div>

              <p className="scope-label">Protected this month</p>
              <p className="scope-value num">
                £8,450<span className="scope-cents">.00</span>
              </p>
              <p className="scope-sub">Across 9 approved change orders</p>

              <div className="scope-bar" aria-hidden="true">
                <span className="bar bar-approved" />
                <span className="bar bar-awaiting" />
              </div>

              <div className="scope-legend">
                <div className="legend-row">
                  <span className="key key-lime" aria-hidden="true" />
                  <span className="legend-name">Approved</span>
                  <span className="legend-val num">£8,450</span>
                </div>
                <div className="legend-row">
                  <span className="key key-amber" aria-hidden="true" />
                  <span className="legend-name">Awaiting</span>
                  <span className="legend-val num">£1,240</span>
                </div>
              </div>

              <button className="scope-cta" type="button">
                Review 3 pending changes
                <Icon icon={ArrowRight} className="ico ico-sm" />
              </button>
            </section>

            <section className="panel panel-activity">
              <div className="panel-head">
                <div className="panel-title-wrap">
                  <h2>Recent activity</h2>
                </div>
                <a href="#" className="link">
                  Audit log
                  <Icon icon={ArrowUpRight} className="ico ico-xs" />
                </a>
              </div>

              <ul className="activity">
                {ACTIVITY.map((item, index) => (
                  <li className="activity-item" key={index}>
                    <span className={`event-icon ev-${item.tone}`}>
                      <Icon icon={item.icon} className="ico ico-sm" />
                    </span>
                    <div className="event-body">
                      <p className="event-text">{item.node}</p>
                      <span className="event-time">{item.time}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
