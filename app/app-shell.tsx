"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode, type RefObject } from "react";
import {
  Bell,
  ChevronRight,
  Lock,
  Menu,
  MoreHorizontal,
  Search,
  type LucideIcon,
} from "lucide-react";
import { NAV_GROUPS } from "../lib/jobs-data";
import { getNavCounts, type NavCounts } from "./nav-counts";

/* ------------------------------------------------------------------
   Icon helper — keeps every glyph decorative + consistently sized
   ------------------------------------------------------------------ */
export function Icon({
  icon: Glyph,
  className = "ico",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return <Glyph className={className} aria-hidden="true" />;
}

/* ------------------------------------------------------------------
   Shared app shell: sidebar + topbar chrome used by every screen.
   The page supplies its own breadcrumb and (optionally) wires the
   topbar search to its own filtering state.
   ------------------------------------------------------------------ */
type AppShellProps = {
  activeNav: string;
  breadcrumb: ReactNode;
  children: ReactNode;
  query?: string;
  onQueryChange?: (value: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
};

export default function AppShell({
  activeNav,
  breadcrumb,
  children,
  query = "",
  onQueryChange = () => {},
  searchRef,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Live totals for the nav badges. `null` until loaded, so no badge flashes
  // on first paint; a count of 0 renders no badge at all.
  const [counts, setCounts] = useState<NavCounts | null>(null);
  // Re-fetch the totals whenever the user moves between screens, so a
  // create or delete is reflected in the badges without a reload.
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await getNavCounts();
      if (active) setCounts(result);
    })();
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef?.current?.focus();
        searchRef?.current?.select();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchRef]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setSidebarOpen(false);
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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
                  const isLink = item.href !== "#";

                  const handleClick = () => {
                    if (window.matchMedia("(max-width: 1024px)").matches) {
                      setSidebarOpen(false);
                    }
                  };

                  const className = `nav-item${active ? " is-active" : ""}`;

                  const inner = (
                    <>
                      <Icon icon={item.icon} className="ico nav-ico" />
                      <span className="nav-label">{item.label}</span>
                      {(() => {
                        const count = item.countKey ? counts?.[item.countKey] ?? 0 : 0;
                        return count > 0 ? (
                          <span className="nav-badge">
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null;
                      })()}
                    </>
                  );

                  return isLink ? (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={className}
                      aria-current={active ? "page" : undefined}
                      onClick={handleClick}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <a
                      key={item.id}
                      href="#"
                      className={className}
                      aria-current={active ? "page" : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        handleClick();
                      }}
                    >
                      {inner}
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
                  {breadcrumb}
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
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        onQueryChange("");
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

          {children}
        </main>
      </div>
    </>
  );
}
