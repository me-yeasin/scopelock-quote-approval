"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Bell,
  ChevronRight,
  Lock,
  LogOut,
  Menu,
  Search,
  type LucideIcon,
} from "lucide-react";
import { NAV_GROUPS } from "../lib/jobs-data";
import { getNavCounts, type NavCounts } from "./nav-counts";
import {
  loadNotifications,
  markAllAsRead,
  markNotificationAsRead,
} from "./notifications-actions";
import NotificationPanel from "./notification-panel";
import { notificationCountLabel, type NotificationFeed } from "../lib/notifications-shared";
import { signOutAction as signOut } from "./auth/actions";
import { useSessionUser } from "./use-session-user";

/** "James Doyle" -> "JD"; single names get one letter. */
function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

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
  // Supplied once by the root layout via context.
  const user = useSessionUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, startTransition] = useTransition();
  const initials = initialsOf(user?.name ?? "");
  // Live totals for the nav badges. `null` until loaded, so no badge flashes
  // on first paint; a count of 0 renders no badge at all.
  const [counts, setCounts] = useState<NavCounts | null>(null);
  // Notification feed and its open/closed state. `null` means "not loaded
  // yet", which renders no badge — the badge must never appear before we
  // actually know there is something to report.
  const [notifications, setNotifications] = useState<NotificationFeed | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  /** Re-read the feed; used after marking items read. */
  const refreshNotifications = useCallback(async () => {
    const next = await loadNotifications();
    setNotifications(next);
  }, []);

  /**
   * Opening an item marks it read.
   *
   * The badge is decremented immediately so the count never looks stale while
   * the write is in flight — the server call then reconciles with the truth.
   */
  const handleItemOpen = useCallback(
    (item: { id: string }) => {
      setNotifications((current) => {
        if (!current) return current;
        const items = current.items.map((entry) =>
          entry.id === item.id ? { ...entry, read: true } : entry,
        );
        return {
          ...current,
          items,
          count: Math.max(0, items.filter((entry) => !entry.read).length),
        };
      });
      void markNotificationAsRead(item.id);
    },
    [],
  );

  const handleMarkAll = useCallback(() => {
    setNotifications((current) =>
      current
        ? { ...current, items: current.items.map((entry) => ({ ...entry, read: true })), count: 0 }
        : current,
    );
    void markAllAsRead().then(refreshNotifications);
  }, [refreshNotifications]);
  // Re-fetch the totals whenever the user moves between screens, so a
  // create or delete is reflected in the badges without a reload.
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    (async () => {
      const [countResult, notifResult] = await Promise.all([
        getNavCounts(),
        loadNotifications(),
      ]);
      if (!active) return;
      setCounts(countResult);
      setNotifications(notifResult);
    })();
    return () => {
      active = false;
    };
  }, [pathname]);

  // Leaving the page closes the panel; a popover should not survive a route
  // change and reappear somewhere unexpected.
  useEffect(() => {
    setNotifOpen(false);
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

            {/* The real signed-in account, with a way out. */}
            <div className="user-card">
              <span className="user-avatar">{initials}</span>
              <span className="user-meta">
                <span className="user-name">{user?.name ?? "Your account"}</span>
                <span className="user-org">{user?.companyName ?? ""}</span>
              </span>
              <button
                className="user-signout"
                type="button"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => startTransition(() => void signOut())}
              >
                <Icon icon={LogOut} className="ico ico-sm" />
              </button>
            </div>
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

                <div className="bell-wrap">
                  <button
                    className={`icon-btn bell${notifOpen ? " is-open" : ""}`}
                    type="button"
                    aria-label={notificationCountLabel(notifications?.count ?? 0)}
                    aria-expanded={notifOpen}
                    aria-haspopup="dialog"
                    onClick={() => setNotifOpen((open) => !open)}
                  >
                    <Icon icon={Bell} />
                    {/* The indicator is rendered only when there is something
                        to report. A permanently-lit dot trains people to
                        ignore it. */}
                    {notifications && notifications.count > 0 ? (
                      <span className="bell-dot" aria-hidden="true">
                        {notifications.count > 9 ? "9+" : notifications.count}
                      </span>
                    ) : null}
                  </button>

                  {notifOpen ? (
                    <NotificationPanel
                      feed={notifications}
                      loading={notifications === null}
                      onClose={() => setNotifOpen(false)}
                      onNavigate={() => setNotifOpen(false)}
                      onItemOpen={handleItemOpen}
                      onMarkAll={handleMarkAll}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          {children}
        </main>
      </div>
    </>
  );
}
