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
  badge?: number;
  href: string;
};

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/" },
      { id: "jobs", label: "Jobs", icon: Briefcase, badge: 3, href: "/jobs" },
      { id: "quotes", label: "Quotes", icon: FileText, badge: 2, href: "/quotes" },
    ],
  },
  {
    label: "Records",
    items: [
      { id: "changes", label: "Change orders", icon: FileDiff, badge: 1, href: "#" },
      { id: "invoices", label: "Invoices", icon: ReceiptText, href: "#" },
      { id: "audit", label: "Audit log", icon: ScrollText, href: "#" },
      { id: "settings", label: "Settings", icon: Settings, href: "#" },
    ],
  },
];
