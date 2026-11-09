/* ------------------------------------------------------------------
   Job domain types + mock data (no UI imports — safe for server code)
   ------------------------------------------------------------------ */

export type StatusKey = "approved" | "awaiting" | "inprogress" | "draft";
export type ChangeTone = "up" | "down" | "none";
export type Filter = "all" | "awaiting" | "approved" | "draft" | "inprogress";

export const STATUS_LABEL: Record<StatusKey, string> = {
  approved: "Approved",
  awaiting: "Awaiting",
  inprogress: "In progress",
  draft: "Draft",
};

export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "awaiting", label: "Awaiting" },
  { id: "approved", label: "Approved" },
  { id: "inprogress", label: "In progress" },
  { id: "draft", label: "Draft" },
];

export type Job = {
  /** Human-readable reference shown in the UI (e.g. J-2026-048). */
  id: string;
  /**
   * Stable storage id (the Mongo `_id` hex string) used for mutations. The
   * reference is derived from the ObjectId suffix and is not guaranteed
   * unique, so writes must not rely on `id` alone.
   */
  objectId?: string;
  /** Raw ISO `updatedAt` used for optimistic-concurrency checks on save. */
  updatedAt?: string;
  title: string;
  city: string;
  customer: string;
  initials: string;
  quote: string;
  change: string;
  changeTone: ChangeTone;
  total: string;
  status: StatusKey;
  updated: string;
};

/* Mock data — used by the Overview screen. The Jobs screen now loads
   live data from MongoDB instead. */
export const JOBS: Job[] = [
  {
    id: "J-2026-048",
    title: "Bathroom renovation",
    city: "London",
    customer: "M. Harris",
    initials: "MH",
    quote: "£1,200.00",
    change: "+£180.00",
    changeTone: "up",
    total: "£1,380.00",
    status: "approved",
    updated: "2 days ago",
  },
  {
    id: "J-2026-047",
    title: "Kitchen tap replacement",
    city: "Manchester",
    customer: "S. Patel",
    initials: "SP",
    quote: "£240.00",
    change: "—",
    changeTone: "none",
    total: "£240.00",
    status: "awaiting",
    updated: "12 Apr",
  },
  {
    id: "J-2026-046",
    title: "Boiler service & check",
    city: "Birmingham",
    customer: "D. Wright",
    initials: "DW",
    quote: "£350.00",
    change: "+£60.00",
    changeTone: "up",
    total: "£410.00",
    status: "inprogress",
    updated: "10 Apr",
  },
  {
    id: "J-2026-045",
    title: "Radiator install",
    city: "Leeds",
    customer: "L. Chen",
    initials: "LC",
    quote: "£890.00",
    change: "-£50.00",
    changeTone: "down",
    total: "£840.00",
    status: "approved",
    updated: "8 Apr",
  },
  {
    id: "J-2026-044",
    title: "External painting",
    city: "Bristol",
    customer: "R. Okafor",
    initials: "RO",
    quote: "£1,100.00",
    change: "—",
    changeTone: "none",
    total: "£1,100.00",
    status: "draft",
    updated: "5 Apr",
  },
  {
    id: "J-2026-043",
    title: "Loft insulation",
    city: "Nottingham",
    customer: "A. Novak",
    initials: "AN",
    quote: "£1,650.00",
    change: "+£220.00",
    changeTone: "up",
    total: "£1,870.00",
    status: "awaiting",
    updated: "3 Apr",
  },
  {
    id: "J-2026-042",
    title: "Garden fence repair",
    city: "Cardiff",
    customer: "T. Begum",
    initials: "TB",
    quote: "£480.00",
    change: "—",
    changeTone: "none",
    total: "£480.00",
    status: "draft",
    updated: "1 Apr",
  },
];
