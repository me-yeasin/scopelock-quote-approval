/* ------------------------------------------------------------------
   Change orders — view models for the UI layer.

   A change order is the only legal way to move the price after a quote
   has been approved. The approved quote becomes a frozen baseline; every
   change order is measured against it, and only approved ones are
   billable.

   The rules this model encodes:

   - A change order belongs to a job and points at the quote it modifies.
   - It is never applied to the quote's subtotal. The baseline stays the
     baseline; the job total is baseline + approved changes.
   - addCents and creditCents are both positive integers in minor units.
     `creditCents` is the magnitude of a reduction, so a subtraction is
     never represented by a negative number in the wrong field.
   - The net effect is derived, never stored twice.
   ------------------------------------------------------------------ */

export type ChangeOrderStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "withdrawn";

export const CHANGE_STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  draft: "Draft",
  sent: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

export const CHANGE_FILTERS: { id: ChangeOrderStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sent", label: "Awaiting" },
  { id: "approved", label: "Approved" },
  { id: "draft", label: "Drafts" },
  { id: "rejected", label: "Rejected" },
  { id: "expired", label: "Expired" },
];

/** Why the scope moved. Mirrored in the filter chips and the badge tone. */
export type ChangeKind =
  | "extra-work"
  | "variation"
  | "omission"
  | "materials"
  | "delay";

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  "extra-work": "Extra work",
  variation: "Variation",
  omission: "Omission",
  materials: "Materials",
  delay: "Delay",
};

export type ChangeLine = {
  id: string;
  description: string;
  quantity: number;
  /** Minor units (pence/cents). */
  unitPriceCents: number;
  /** A credit reduces the price; rendered with a minus sign. */
  direction: "add" | "credit";
};

export type ChangeOrder = {
  /** Gapless per-year number, e.g. CO-2026-0003. */
  id: string;
  jobReference: string;
  /** The approved quote this change is measured against. */
  quoteReference: string;
  /** Job title, so the list reads without a second lookup. */
  jobTitle: string;
  customer: string;
  customerInitials: string;
  city: string;
  currency: "GBP" | "EUR";
  status: ChangeOrderStatus;
  kind: ChangeKind;
  /** One line explaining what changed, shown in the list. */
  summary: string;
  /** The reason, the full narrative shown in the drawer. */
  reason: string;
  lines: ChangeLine[];
  /** Frozen quote subtotal this change sits on top of. */
  baselineCents: number;
  issuedAt: string;
  validUntil: string;
  link?: {
    url: string;
    sentAt: string;
    sentTo: string;
    method: "email" | "sms" | "copy";
  };
  decidedAt?: string;
  rejectionReason?: string;
  activity: { id: string; label: string; detail: string; at: string }[];
};

/* ------------------------------------------------------------------
   Derived amounts. Each function is pure and unit-tested by eye:
   a credit can never accidentally increase the total.
   ------------------------------------------------------------------ */

export function changeLineTotal(line: ChangeLine) {
  const magnitude = Math.round(line.quantity * line.unitPriceCents);
  return line.direction === "credit" ? -magnitude : magnitude;
}

/** Signed net effect of the change order: positive adds, negative credits. */
export function changeNet(order: ChangeOrder) {
  return order.lines.reduce((sum, line) => sum + changeLineTotal(line), 0);
}

export function changeIsCredit(order: ChangeOrder) {
  return changeNet(order) < 0;
}

/** What the customer would owe if this change were approved. */
export function changeNewTotal(order: ChangeOrder) {
  return order.baselineCents + changeNet(order);
}

/** Only approved changes are billable; everything else is provisional. */
export function changeIsBillable(order: ChangeOrder) {
  return order.status === "approved";
}
