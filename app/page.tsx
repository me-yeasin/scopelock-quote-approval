"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  FileDiff,
  FilePlus2,
  FileText,
  FolderPlus,
  LayoutDashboard,
  Lock,
  Menu,
  MoreHorizontal,
  Plus,
  ReceiptText,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------
   Icon helper — keeps every glyph decorative + consistently sized
   ------------------------------------------------------------------ */
function Icon({
  icon: Glyph,
  className = "ico",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return <Glyph className={className} aria-hidden="true" />;
}

/* ------------------------------------------------------------------
   Data
   ------------------------------------------------------------------ */
type NavItem = { id: string; label: string; icon: LucideIcon; badge?: number };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "jobs", label: "Jobs", icon: Briefcase, badge: 3 },
      { id: "quotes", label: "Quotes", icon: FileText, badge: 2 },
    ],
  },
  {
    label: "Records",
    items: [
      { id: "changes", label: "Change orders", icon: FileDiff, badge: 1 },
      { id: "invoices", label: "Invoices", icon: ReceiptText },
      { id: "audit", label: "Audit log", icon: ScrollText },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

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

const ACTIONS: { title: string; desc: string; icon: LucideIcon; primary?: boolean }[] = [
  { title: "New job", desc: "Create a job and start a quote", icon: FolderPlus, primary: true },
  { title: "New quote", desc: "Build a quote with line items", icon: FilePlus2 },
  { title: "Change order", desc: "Add a change to an active job", icon: FileDiff },
  { title: "Invoice", desc: "Generate a PDF invoice", icon: ReceiptText },
];

type StatusKey = "approved" | "awaiting" | "inprogress" | "draft";
type ChangeTone = "up" | "down" | "none";
type Filter = "all" | "awaiting" | "approved";

const STATUS_LABEL: Record<StatusKey, string> = {
  approved: "Approved",
  awaiting: "Awaiting",
  inprogress: "In progress",
  draft: "Draft",
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "awaiting", label: "Awaiting" },
  { id: "approved", label: "Approved" },
];

const JOBS: {
  id: string;
  title: string;
  city: string;
  customer: string;
  initials: string;
  quote: string;
  change: string;
  changeTone: ChangeTone;
  total: string;
  status: StatusKey;
  updated: string;
}[] = [
  {
    id: "J-2026-048",
    title: "Bathroom renovation",
    city: "London",
    customer: "M. Harris",
    initials: "MH",
    quote: "£1,200.00",
    change: "+£180.00",
    changeTone: "up",
    total: "£1,380.00",
    status: "approved",
    updated: "2 days ago",
  },
  {
    id: "J-2026-047",
    title: "Kitchen tap replacement",
    city: "Manchester",
    customer: "S. Patel",
    initials: "SP",
    quote: "£240.00",
    change: "—",
    changeTone: "none",
    total: "£240.00",
    status: "awaiting",
    updated: "12 Apr",
  },
  {
    id: "J-2026-046",
    title: "Boiler service & check",
    city: "Birmingham",
    customer: "D. Wright",
    initials: "DW",
    quote: "£350.00",
    change: "+£60.00",
    changeTone: "up",
    total: "£410.00",
    status: "inprogress",
    updated: "10 Apr",
  },
  {
    id: "J-2026-045",
    title: "Radiator install",
    city: "Leeds",
    customer: "L. Chen",
    initials: "LC",
    quote: "£890.00",
    change: "-£50.00",
    changeTone: "down",
    total: "£840.00",
    status: "approved",
    updated: "8 Apr",
  },
  {
    id: "J-2026-044",
    title: "External painting",
    city: "Bristol",
    customer: "R. Okafor",
    initials: "RO",
    quote: "£1,100.00",
    change: "—",
    changeTone: "none",
    total: "£1,100.00",
    status: "draft",
    updated: "5 Apr",
  },
  {
    id: "J-2026-043",
    title: "Loft insulation",
    city: "Nottingham",
    customer: "A. Novak",
    initials: "AN",
    quote: "£1,650.00",
    change: "+£220.00",
    changeTone: "up",
    total: "£1,870.00",
    status: "awaiting",
    updated: "3 Apr",
  },
  {
    id: "J-2026-042",
    title: "Garden fence repair",
    city: "Cardiff",
    customer: "T. Begum",
    initials: "TB",
    quote: "£480.00",
    change: "—",
    changeTone: "none",
    total: "£480.00",
    status: "draft",
    updated: "1 Apr",
  },
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("overview");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setSidebarOpen(false);
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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
    <>
      <div
        className="scrim"
        id="scrim"
        hidden={!sidebarOpen}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      <div className="shell">
        {/* ============ Sidebar ============ */}
        <aside className={`sidebar${sidebarOpen ? " is-open" : ""}`} id="sidebar">
          <div className="brand">
            <span className="brand-mark">
              <Icon icon={Lock} />
            </span>
            <span className="brand-copy">
              <span className="brand-name">ScopeLock</span>
              <span className="brand-sub">Trade workspace</span>
            </span>
          </div>

          <nav className="nav" aria-label="Primary">
            {NAV_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <p className="nav-group">{group.label}</p>
                {group.items.map((item) => {
                  const active = activeNav === item.id;

                  return (
                    <a
                      key={item.id}
                      href="#"
                      className={`nav-item${active ? " is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        setActiveNav(item.id);
                        if (window.matchMedia("(max-width: 1024px)").matches) {
                          setSidebarOpen(false);
                        }
                      }}
                    >
                      <Icon icon={item.icon} className="ico nav-ico" />
                      <span className="nav-label">{item.label}</span>
                      {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                    </a>
                  );
                })}
              </Fragment>
            ))}
          </nav>

          <div className="sidebar-foot">
            <div className="sync-card">
              <span className="pulse" aria-hidden="true" />
              <span className="sync-copy">
                <span className="sync-title">Ledger up to date</span>
                <span className="sync-sub">Synced 2 minutes ago</span>
              </span>
            </div>

            <button className="user-card" type="button">
              <span className="user-avatar">JD</span>
              <span className="user-meta">
                <span className="user-name">James Doyle</span>
                <span className="user-org">Harris &amp; Co.</span>
              </span>
              <Icon icon={MoreHorizontal} className="ico ico-sm user-more" />
            </button>
          </div>
        </aside>

        {/* ============ Main ============ */}
        <main className="main">
          <header className="topbar">
            <div className="topbar-inner">
              <div className="topbar-left">
                <button
                  className="icon-btn menu-toggle"
                  id="menuToggle"
                  type="button"
                  aria-label="Open navigation"
                  aria-expanded={sidebarOpen}
                  aria-controls="sidebar"
                  onClick={() => setSidebarOpen((open) => !open)}
                >
                  <Icon icon={Menu} />
                </button>

                <nav className="crumbs" aria-label="Breadcrumb">
                  <span className="crumb-muted">Workspace</span>
                  <Icon icon={ChevronRight} className="ico ico-sm crumb-sep" />
                  <span className="crumb-current">Overview</span>
                </nav>
              </div>

              <div className="topbar-right">
                <div className="search" role="search">
                  <Icon icon={Search} className="ico ico-sm search-ico" />
                  <input
                    ref={searchRef}
                    id="searchInput"
                    type="search"
                    className="search-input"
                    placeholder="Search jobs, customers, quotes"
                    aria-label="Search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setQuery("");
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <kbd className="kbd">⌘K</kbd>
                </div>

                <button className="icon-btn bell" type="button" aria-label="Notifications">
                  <Icon icon={Bell} />
                  <span className="bell-dot" aria-hidden="true" />
                </button>
              </div>
            </div>
          </header>

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
                <button className="btn btn-primary" type="button">
                  <Icon icon={Plus} className="ico ico-sm" />
                  New job
                </button>
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
                  <a
                    key={action.title}
                    href="#"
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
                  </a>
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
                            <span className={`status status-${job.status}`}>
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
        </main>
      </div>
    </>
  );
}
