"use server";

import { getDb } from "@/lib/db";

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
};

export async function getNavCounts(): Promise<NavCounts> {
  try {
    const db = await getDb();

    const [jobs, quotes, changes] = await Promise.all([
      db.collection("jobs").estimatedDocumentCount(),
      db.collection("quotes").estimatedDocumentCount(),
      // Change orders are not modelled yet; the collection may not exist.
      db
        .collection("changeOrders")
        .estimatedDocumentCount()
        .catch(() => 0),
    ]);

    return { jobs, quotes, changes };
  } catch {
    // Counts are decorative: if the database is unreachable the nav still
    // renders, just without badges.
    return { jobs: 0, quotes: 0, changes: 0 };
  }
}
