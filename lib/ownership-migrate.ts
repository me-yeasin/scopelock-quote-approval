import { getDb } from "./db";
import { OWNED_COLLECTIONS, type OwnedCollection } from "./ownership";

/* ------------------------------------------------------------------
   Ownership migration.

   Documents written before authentication existed have no `ownerId`. Leaving
   them unscoped would mean one account could never see its own jobs again
   (every query filters by owner), and leaving them visible to all would be a
   leak.

   The rule applied here: the first account to sign in adopts the legacy data,
   and only once. On a brand-new database there is nothing to adopt and this
   does nothing at all.

   Claiming is deliberately one-shot. A marker document records that the
   handover happened, so a *second* account created later cannot inherit
   anything — otherwise every new sign-up would steal the previous user's
   workspace.
   ------------------------------------------------------------------ */

const MIGRATION = "ownership";

type Marker = { _id: string; claimedBy: string | null; claimedAt: string };

/** Attempt to adopt pre-auth documents. Safe to call on every login. */
export async function claimOrphanDocuments(ownerId: string): Promise<void> {
  const db = await getDb();
  const markers = db.collection<Marker>(MIGRATION);

  // Checked first and cheap: after the one-time handover this returns early on
  // every subsequent request.
  const existing = await markers.findOne({ _id: "legacy-claim" });
  if (existing) return;

  // Count what is actually there before writing the marker, so a database that
  // had no legacy data still records "settled" and never claims later.
  let claimed = 0;
  for (const name of OWNED_COLLECTIONS) {
    const result = await db
      .collection(name)
      .updateMany({ ownerId: { $exists: false } }, { $set: { ownerId } });
    claimed += result.modifiedCount;
  }

  await markers.updateOne(
    { _id: "legacy-claim" },
    { $setOnInsert: { claimedBy: claimed > 0 ? ownerId : null, claimedAt: new Date().toISOString() } },
    { upsert: true },
  );

  if (claimed > 0) {
    console.info(`[ownership] assigned ${claimed} legacy document(s) to ${ownerId.slice(0, 6)}…`);
  }
}

/* ------------------------------------------------------------------
   Indexes.

   Every per-user query now filters on `ownerId`, so each hot index leads with
   it. The reference indexes stay unique *globally* rather than per user —
   references such as "Q-2026-0002" are what appear on customer-facing links,
   and a duplicate across accounts would make them ambiguous.
   ------------------------------------------------------------------ */

let ensured = false;

export async function ensureOwnershipIndexes(): Promise<void> {
  if (ensured) return;

  const db = await getDb();

  const specs: Record<OwnedCollection, { keys: Record<string, 1 | -1>; unique?: boolean }[]> = {
    jobs: [
      { keys: { ownerId: 1, createdAt: -1 } },
      { keys: { ownerId: 1, status: 1 } },
    ],
    quotes: [
      { keys: { ownerId: 1, createdAt: -1 } },
      { keys: { ownerId: 1, status: 1 } },
      { keys: { ownerId: 1, jobReference: 1 } },
    ],
    changeOrders: [
      { keys: { ownerId: 1, createdAt: -1 } },
      { keys: { ownerId: 1, status: 1 } },
      { keys: { ownerId: 1, jobReference: 1, status: 1 } },
    ],
    invoices: [
      { keys: { ownerId: 1, issuedAt: -1 } },
      { keys: { ownerId: 1, status: 1 } },
    ],
  };

  for (const [name, list] of Object.entries(specs) as [OwnedCollection, typeof specs.jobs][]) {
    for (const spec of list) {
      await db
        .collection(name)
        .createIndex(spec.keys, spec.unique ? { unique: true } : {})
        .catch(() => {
          // An equivalent index under a different name is fine, and a failure
          // here must not block the app from starting.
        });
    }
  }

  ensured = true;
}
