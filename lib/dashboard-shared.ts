/* ------------------------------------------------------------------
   Overview — shared view models.

   Free of any database import so the Client Component can use these types
   without dragging `mongodb` into the browser bundle.
   ------------------------------------------------------------------ */

export type DashboardCounts = {
  jobs: number;
  jobsInProgress: number;
  quotesAwaiting: number;
  changesAwaiting: number;
  invoicesOutstanding: number;
  invoicesOverdue: number;
};

/**
 * Every headline figure on the overview.
 *
 * Money is kept per currency rather than summed into one number: £1,000 and
 * €1,000 are not £2,000, and a single blended figure would be quietly wrong
 * for anyone working across a border.
 */
export type DashboardMoney = {
  /** Value of approved quotes still in play (approved + their changes). */
  agreed: Record<string, number>;
  /** Approved change-order value — the "scope protection" headline. */
  protectedChanges: Record<string, number>;
  /** Raised but not yet agreed — money at risk if the customer says no. */
  awaitingChanges: Record<string, number>;
  /** Invoiced and unpaid. */
  outstanding: Record<string, number>;
  /** Invoiced, unpaid and past its due date. */
  overdue: Record<string, number>;
};

export type DashboardJobRow = {
  reference: string;
  title: string;
  customer: string;
  initials: string;
  city: string;
  status: string;
  statusLabel: string;
  quoteLabel: string;
  changeLabel: string;
  changeTone: "add" | "credit" | "none";
  totalLabel: string;
  updatedLabel: string;
  /** Rxact milliseconds for sort stability; not displayed. */
  updatedAtMs: number;
};

export type DashboardActivity = {
  id: string;
  tone: "agree" | "decline" | "moved" | "sent" | "seen" | "created" | "other";
  label: string;
  detail: string;
  documentReference: string;
  jobReference: string;
  at: string;
  /** Pre-formatted relative time ("2 hours ago"), resolved on the client. */
  ago: string;
};

export type Dashboard = {
  counts: DashboardCounts;
  money: DashboardMoney;
  jobs: DashboardJobRow[];
  activity: DashboardActivity[];
  /** True when the workspace has no jobs, quotes, changes or invoices yet. */
  isEmpty: boolean;
  /** Approved change orders this calendar month, for the scope block. */
  protectedCount: number;
  /** Change orders still waiting on the customer. */
  awaitingCount: number;
  /** Quotes sent but not yet decided. */
  quotesAwaitingCount: number;
  /** Currency used for headline figures — the most common in the data. */
  primaryCurrency: string;
};

/* ------------------------------------------------------------------
   Formatting helpers shared by every block on the page.
   ------------------------------------------------------------------ */

/** Minor units to a display string, with the currency's own symbol. */
export function formatMoney(cents: number, currency: string) {
  const value = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/**
 * Format a per-currency map for display.
 *
 * Returns the primary currency's figure as the headline plus an "and N more"
 * count, because stacking currencies into one number would be misleading.
 */
export function headlineMoney(map: Record<string, number>, primary: string) {
  const keys = Object.keys(map).filter((key) => map[key] !== 0);
  if (keys.length === 0) return { value: formatMoney(0, primary), other: 0 };

  const sorted = keys.sort((a, b) => Math.abs(map[b]) - Math.abs(map[a]));
  const lead = sorted.includes(primary) ? primary : sorted[0];

  return {
    value: formatMoney(map[lead] ?? 0, lead),
    other: Math.max(0, keys.length - 1),
  };
}

/** Pick the currency most often seen, so headline figures use the right one. */
export function pickPrimaryCurrency(seen: string[]): string {
  const tally = new Map<string, number>();
  for (const code of seen) {
    const key = (code || "GBP").toUpperCase();
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best = "GBP";
  let bestCount = 0;
  for (const [code, count] of tally) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

export function addTo(map: Record<string, number>, currency: string, cents: number) {
  const key = (currency || "GBP").toUpperCase();
  map[key] = (map[key] ?? 0) + cents;
}

/**
 * Relative time from an ISO timestamp.
 *
 * Takes `now` explicitly rather than reading the clock, so a Client
 * Component can pass a value that is null during prerender instead of
 * failing the static build.
 */
export function relativeTime(iso: string, now: number | null) {
  if (now === null) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;

  const years = Math.round(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

/** "Good morning" / "Good afternoon" / "Good evening" — resolved client-side. */
export function greetingFor(now: number | null) {
  if (now === null) return "Hello";
  const hour = new Date(now).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Long date for the eyebrow, resolved client-side. */
export function todayLabel(now: number | null) {
  if (now === null) return "";
  return new Date(now).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
