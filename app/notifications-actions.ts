"use server";

import { getNotifications } from "@/lib/notifications";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationVersion,
} from "@/lib/notification-reads";
import type { NotificationFeed } from "@/lib/notifications-shared";

/* ------------------------------------------------------------------
   Notification server action.

   The shell is a Client Component, so it fetches through here rather than
   importing the aggregation directly — that keeps `mongodb` out of the
   browser bundle.
   ------------------------------------------------------------------ */

export async function loadNotifications(): Promise<NotificationFeed> {
  try {
    return await getNotifications();
  } catch {
    // A failed notification read must never break the chrome. An empty feed
    // simply shows no badge, which is the safe default.
    return { items: [], count: 0, total: 0, urgentCount: 0 };
  }
}

/**
 * Mark one notification as read.
 *
 * Called when the user opens an item. The version fingerprint is recomputed
 * here rather than trusted from the client, so a stale page cannot mark a
 * materially different alert as read.
 */
export async function markNotificationAsRead(id: string): Promise<void> {
  if (!id) return;

  try {
    // Rebuild the feed to get the authoritative version of this item.
    const feed = await getNotifications();
    const item = feed.items.find((candidate) => candidate.id === id);
    if (!item) return;

    await markNotificationRead(id, notificationVersion(item));
  } catch {
    // Read state is cosmetic; never surface an error for it.
  }
}

/** Mark every currently-outstanding notification as read. */
export async function markAllAsRead(): Promise<void> {
  try {
    const feed = await getNotifications();
    await markAllNotificationsRead(
      feed.items.map((item) => ({ key: item.id, version: notificationVersion(item) })),
    );
  } catch {
    // As above.
  }
}
