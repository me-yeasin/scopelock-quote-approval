import { ObjectId, type Db } from "mongodb";

import { getDb } from "./db";

/* ------------------------------------------------------------------
   Notification read state.

   Everything else about a notification is derived from live documents, so
   this module exists for the one fact the documents cannot tell us: whether
   the tradesperson has *looked* at a given alert.

   Design notes:

   - Keys are the notification's stable id (`kind:documentReference`), not a
     row id. That means a re-derived feed can match a read record without
     storing anything about the notification itself.
   - Records carry a `version` fingerprint. When the underlying item changes
     — a change order re-sent, an invoice becoming overdue — the id stays the
     same but the content does not, so the record is treated as stale and the
     item surfaces as unread again. Without this, a "read" flag would
     permanently silence an item that later escalates.
   - Documents are keyed per workspace. There is no user model yet, so a
     single `default` scope is used; adding users later means changing one
     constant, not the schema.
   ------------------------------------------------------------------ */

const COLLECTION = "notificationReads";

/** Placeholder workspace scope until accounts exist. */
const SCOPE = "default";

type ReadRecord = {
  _id?: ObjectId;
  scope: string;
  /** Notification id, e.g. "invoice-overdue:INV-2026-0001". */
  key: string;
  /** Fingerprint of the item when it was read. Mismatch = unread again. */
  version: string;
  readAt: string;
};

/**
 * A stable fingerprint of a notification's content.
 *
 * Only fields that change the *meaning* of the alert are included, so
 * superficial churn does not resurrect a dismissed item.
 */
export function notificationVersion(parts: {
  title: string;
  detail: string;
  amountCents?: number;
  daysOverdue?: number;
}) {
  return [parts.title, parts.detail, parts.amountCents ?? 0, parts.daysOverdue ?? 0].join("|");
}

export function notificationReadsCollection(db: Db) {
  return db.collection<ReadRecord>(COLLECTION);
}

let indexesEnsured = false;

async function ensureIndexes(db: Db) {
  if (indexesEnsured) return;
  await notificationReadsCollection(db).createIndex({ scope: 1, key: 1 }, { unique: true });
  indexesEnsured = true;
}

/** Map of notification key → the version that was read. */
export async function getReadVersions(): Promise<Map<string, string>> {
  const db = await getDb();
  await ensureIndexes(db);

  const docs = await notificationReadsCollection(db).find({ scope: SCOPE }).toArray();
  return new Map(docs.map((doc) => [doc.key, doc.version]));
}

/** Record one notification as read at its current version. */
export async function markNotificationRead(key: string, version: string): Promise<void> {
  if (!key) return;

  const db = await getDb();
  await ensureIndexes(db);

  await notificationReadsCollection(db).updateOne(
    { scope: SCOPE, key },
    { $set: { version, readAt: new Date().toISOString() } },
    { upsert: true },
  );
}

/** Record every supplied item as read — used by "mark all as read". */
export async function markAllNotificationsRead(
  entries: { key: string; version: string }[],
): Promise<void> {
  if (entries.length === 0) return;

  const db = await getDb();
  await ensureIndexes(db);

  const now = new Date().toISOString();
  await notificationReadsCollection(db).bulkWrite(
    entries.map((entry) => ({
      updateOne: {
        filter: { scope: SCOPE, key: entry.key },
        update: { $set: { version: entry.version, readAt: now } },
        upsert: true,
      },
    })),
  );
}

/**
 * Drop read records for notifications that no longer exist.
 *
 * Without this the collection grows forever. Pruning on read is enough for a
 * single-workspace tool and costs one extra query per refresh.
 */
export async function pruneReadRecords(liveKeys: string[]): Promise<void> {
  const db = await getDb();
  const collection = notificationReadsCollection(db);

  // Keep the delete cheap and safe: only prune when we actually have a feed.
  if (liveKeys.length === 0) return;

  await collection.deleteMany({ scope: SCOPE, key: { $nin: liveKeys } });
}
