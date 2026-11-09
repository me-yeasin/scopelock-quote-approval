"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Clock,
  FileDiff,
  FileText,
  Inbox,
  ReceiptText,
  X,
} from "lucide-react";
import { Icon } from "./app-shell";
import type { Notification, NotificationFeed } from "../lib/notifications-shared";

/* ------------------------------------------------------------------
   Notification panel.

   A popover anchored to the bell in the topbar. Every item links to the
   screen that owns the decision, so acting on a notification means leaving
   this panel — there is no inline action that could half-succeed in a
   popover.

   Because the feed is derived, the badge and the list are the same data:
   acting on an item removes it, and there is no "mark as read" to get out
   of step.
   ------------------------------------------------------------------ */

const KIND_ICON = {
  "quote-waiting": FileText,
  "change-waiting": FileDiff,
  "invoice-overdue": ReceiptText,
  "ready-to-invoice": CircleCheck,
} as const;

export default function NotificationPanel({
  feed,
  loading,
  onClose,
  onNavigate,
  onItemOpen,
  onMarkAll,
}: {
  feed: NotificationFeed | null;
  loading: boolean;
  onClose: () => void;
  onNavigate: () => void;
  onItemOpen: (item: Notification) => void;
  onMarkAll: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        // Ignore clicks on the bell itself; the button owns its own toggle so
        // clicking it twice does not instantly reopen the panel.
        const bell = (target as HTMLElement).closest?.(".bell");
        if (!bell) onClose();
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  const items = feed?.items ?? [];

  return (
    <div
      className="notif-panel"
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      aria-live="polite"
    >
      <header className="notif-head">
        <div>
          <h2>
            Notifications
            {!loading && feed && feed.count > 0 ? (
              <span className="notif-count-pill">{feed.count}</span>
            ) : null}
          </h2>
          <p>
            {loading
              ? "Checking for work…"
              : feed && feed.count > 0
                ? `${feed.count} unread of ${feed.total} outstanding`
                : feed && feed.total > 0
                  ? "All read — nothing new"
                  : "You are all caught up"}
          </p>
        </div>
        <button className="icon-btn" type="button" aria-label="Close notifications" onClick={onClose}>
          <Icon icon={X} />
        </button>
      </header>

      <div className="notif-body">
        {loading ? (
          <ul className="notif-list" aria-busy="true">
            {[0, 1, 2].map((row) => (
              <li className="notif-item is-skeleton" key={row} aria-hidden="true">
                <span className="sk sk-icon" />
                <div>
                  <span className="sk sk-title" />
                  <span className="sk sk-sub" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="notif-empty">
            <span className="notif-empty-mark">
              <Icon icon={Inbox} />
            </span>
            <h3>Nothing needs you</h3>
            <p>
              Quotes, change orders and invoices that are waiting on someone will appear
              here.
            </p>
          </div>
        ) : (
          <ul className="notif-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`notif-item notif-${item.tone}${item.read ? " is-read" : " is-unread"}`}
                  onClick={() => {
                    // Mark as read before navigating; the shell re-fetches on
                    // route change, so the badge drops as the new page loads.
                    onItemOpen(item);
                    onNavigate();
                  }}
                >
                  <span className="notif-ico" aria-hidden="true">
                    <Icon icon={KIND_ICON[item.kind]} className="ico ico-sm" />
                  </span>
                  <span className="notif-copy">
                    <span className="notif-title">
                      {item.read ? null : <span className="notif-unread-dot" aria-hidden="true" />}
                      {item.title}
                    </span>
                    <span className="notif-detail">{item.detail}</span>
                    <span className="notif-meta">
                      <Icon
                        icon={item.tone === "warn" ? CircleAlert : Clock}
                        className="ico ico-xs"
                      />
                      {item.jobReference}
                    </span>
                  </span>
                  <Icon icon={ArrowRight} className="ico ico-xs notif-go" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && items.length > 0 ? (
        <footer className="notif-foot">
          {feed && feed.count > 0 ? (
            <button className="notif-mark-all" type="button" onClick={onMarkAll}>
              Mark all as read
            </button>
          ) : null}
          <Link href="/audit" className="notif-foot-link" onClick={onNavigate}>
            Audit log
            <Icon icon={ArrowRight} className="ico ico-xs" />
          </Link>
        </footer>
      ) : null}
    </div>
  );
}

export type { Notification };
