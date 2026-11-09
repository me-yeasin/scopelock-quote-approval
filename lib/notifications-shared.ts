/* ------------------------------------------------------------------
   Notifications — shared view models.

   Free of any database import so the Client Component can use these types.

   What counts as a notification here is deliberately narrow. This is not a
   generic activity stream (the audit log is that) — it is the short list of
   things that are *waiting on the tradesperson right now*:

     - a quote the customer has not answered
     - a change order awaiting a decision
     - an invoice that has passed its due date
     - an approved job with no invoice raised yet

   So the badge means "there is work you could do", and it falls to zero on
   its own when that work is done — there is no "mark as read" to forget.
   That is worth stating because the obvious alternative (persisted unread
   state) would let the badge lie: a quote decided on another screen would
   still show as new.
   ------------------------------------------------------------------ */

export type NotificationKind = "quote-waiting" | "change-waiting" | "invoice-overdue" | "ready-to-invoice";

export type Notification = {
  /** Stable key, e.g. "quote-waiting:Q-2026-0002". */
  id: string;
  kind: NotificationKind;
  tone: "action" | "warn" | "calm";
  title: string;
  detail: string;
  href: string;
  jobReference: string;
  documentReference: string;
  /** ISO timestamp the item became actionable, used for ordering. */
  since: string;
  /** Days overdue, when relevant. */
  daysOverdue?: number;
  /**
   * Whether the user has already opened this item.
   *
   * Read state is stored, unlike the rest of the notification, which is
   * derived. That is the one thing the data itself cannot tell us: the job
   * is still awaiting a reply after you have looked at it, but it is no
   * longer *news*.
   */
  read: boolean;
  amountCents?: number;
  currency: string;
};

export type NotificationFeed = {
  items: Notification[];
  /**
   * Unread count — what the bell badge shows.
   *
   * This is deliberately NOT the number of outstanding items: the badge means
   * "there is news you have not looked at", so a job you have already opened
   * stays out of the count until something changes on it again.
   */
  count: number;
  /** Outstanding items of any kind, read or not. */
  total: number;
  /** Items that are both unread and urgent. */
  urgentCount: number;
};

export const NOTIFICATION_LABEL: Record<NotificationKind, string> = {
  "quote-waiting": "Quote awaiting reply",
  "change-waiting": "Change awaiting approval",
  "invoice-overdue": "Invoice overdue",
  "ready-to-invoice": "Ready to invoice",
};

/** Order of importance — an overdue invoice beats a pending quote. */
export const NOTIFICATION_PRIORITY: Record<NotificationKind, number> = {
  "invoice-overdue": 0,
  "change-waiting": 1,
  "quote-waiting": 2,
  "ready-to-invoice": 3,
};

/** Pluralise the badge label for screen readers. */
export function notificationCountLabel(count: number) {
  if (count === 0) return "No new notifications";
  if (count === 1) return "1 new notification";
  return `${count} new notifications`;
}
