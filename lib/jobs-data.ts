import {
  Briefcase,
  FileDiff,
  FileText,
  LayoutDashboard,
  ReceiptText,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import {
  JOBS,
  STATUS_LABEL,
  FILTERS,
  type ChangeTone,
  type Filter,
  type Job,
  type StatusKey,
} from "./jobs-types";

/* Re-export the icon-free domain data so existing imports keep working. */
export { JOBS, STATUS_LABEL, FILTERS };
export type { Job, StatusKey, ChangeTone, Filter };

/* Sidebar navigation — `href: "#"` items are placeholders for screens
   that are not built yet and do not navigate. */
export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * Which live total this item shows as a badge. Counts come from the
   * database at runtime; an item without a `countKey` never shows a badge.
   * A count of 0 hides the badge entirely.
   */
  countKey?: "jobs" | "quotes" | "changes" | "invoices";
  href: string;
};

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/" },
      { id: "jobs", label: "Jobs", icon: Briefcase, countKey: "jobs", href: "/jobs" },
      { id: "quotes", label: "Quotes", icon: FileText, countKey: "quotes", href: "/quotes" },
    ],
  },
  {
    label: "Records",
    items: [
      { id: "changes", label: "Change orders", icon: FileDiff, countKey: "changes", href: "/changes" },
      { id: "invoices", label: "Invoices", icon: ReceiptText, countKey: "invoices", href: "/invoices" },
      { id: "audit", label: "Audit log", icon: ScrollText, href: "/audit" },
      { id: "settings", label: "Settings", icon: Settings, href: "#" },
    ],
  },
];
