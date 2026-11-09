"use server";

import { getDashboard } from "@/lib/dashboard";
import type { Dashboard } from "@/lib/dashboard-shared";

/* ------------------------------------------------------------------
   Overview server actions.

   The page is a Client Component (it owns filters and a search field), so
   it fetches through this action instead of importing the aggregation
   directly — that keeps `mongodb` out of the browser bundle.
   ------------------------------------------------------------------ */

export type DashboardResult =
  | { ok: true; data: Dashboard }
  | { ok: false; error: string };

export async function loadDashboard(): Promise<DashboardResult> {
  try {
    return { ok: true, data: await getDashboard() };
  } catch {
    return {
      ok: false,
      error: "Could not load your overview. Check your connection and try again.",
    };
  }
}
