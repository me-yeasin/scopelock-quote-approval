"use server";

import { getDb } from "@/lib/db";
import { requireOwnerId } from "@/lib/ownership";

/* ------------------------------------------------------------------
   Sidebar badge counts.

   The navigation is shared chrome, so it fetches its own totals instead
   of each page passing them in. Counting in the database keeps this cheap
   — no documents are loaded just to render a number.
   ------------------------------------------------------------------ */

export type NavCounts = {
  jobs: number;
  quotes: number;
  changes: number;
  invoices: number;
};

export async function getNavCounts(): Promise<NavCounts> {
  try {
    const db = await getDb();

    /*
      `countDocuments` rather than `estimatedDocumentCount`: the estimate
      cannot be filtered, and these badges must count only the signed-in
      account's documents. The owner index keeps these counts cheap.
    */
    const ownerId = await requireOwnerId();

    const [jobs, quotes, changes, invoices] = await Promise.all([
      db.collection("jobs").countDocuments({ ownerId }),
      db.collection("quotes").countDocuments({ ownerId }),
      db
        .collection("changeOrders")
        .countDocuments({ ownerId })
        .catch(() => 0),
      // One invoice per job; the collection does not exist before anything
      // is stored, and Mongo treats that as zero rather than an error.
      db
        .collection("invoices")
        .countDocuments({ ownerId })
        .catch(() => 0),
    ]);

    return { jobs, quotes, changes, invoices };
  } catch {
    // Counts are decorative: if the database is unreachable the nav still
    // renders, just without badges.
    return { jobs: 0, quotes: 0, changes: 0, invoices: 0 };
  }
}
