import type { ChangeOrder } from "./changes-types";

/* ------------------------------------------------------------------
   Sample change orders for the UI pass.

   Shaped exactly like the eventual database view model so wiring the
   real query is a swap of this array, not a rewrite of the screen.

   Dates are fixed ISO strings rather than computed at module scope:
   Next.js 16 rejects uncached `Date.now()` during prerender of a Client
   Component, so nothing here may read the clock.
   ------------------------------------------------------------------ */

export const CHANGE_ORDERS: ChangeOrder[] = [
  {
    id: "CO-2026-0005",
    jobReference: "J-2026-7709",
    quoteReference: "Q-2026-0002",
    jobTitle: "Bathroom refit — pipework and fixtures",
    customer: "A. Real Name",
    customerInitials: "AR",
    city: "Bristol",
    currency: "GBP",
    status: "sent",
    kind: "extra-work",
    summary: "Replace corroded section of soil stack found behind the wall",
    reason:
      "Once the boxing was removed, the cast-iron soil stack was found to be corroded through in two places and leaking at the collar. It is not safe to box back in as found. This covers cutting out the affected section, replacing it in PVC, and making good the connection to the existing clay drain.",
    lines: [
      {
        id: "cl1",
        description: "Cut out and replace corroded cast-iron section in PVC",
        quantity: 1,
        unitPriceCents: 28000,
        direction: "add",
      },
      {
        id: "cl2",
        description: "Reconnect to existing clay drain, including collar and mortar",
        quantity: 1,
        unitPriceCents: 9500,
        direction: "add",
      },
      {
        id: "cl3",
        description: "Reinstate boxing and make good",
        quantity: 1,
        unitPriceCents: 6000,
        direction: "add",
      },
    ],
    baselineCents: 103500,
    issuedAt: "2026-11-07T10:20:00.000Z",
    validUntil: "2026-11-21T10:20:00.000Z",
    link: {
      url: "/q/8f3a1c9d7e2b4a6f5c8d1e3b7a9f2c4d",
      sentAt: "2026-11-07T10:22:00.000Z",
      sentTo: "",
      method: "copy",
    },
    activity: [
      {
        id: "e1",
        label: "Change order raised",
        detail: "Created from job J-2026-7709",
        at: "2026-11-07T10:20:00.000Z",
      },
      {
        id: "e2",
        label: "Sent to customer",
        detail: "Approval link copied",
        at: "2026-11-07T10:22:00.000Z",
      },
      {
        id: "e3",
        label: "Viewed by customer",
        detail: "The approval link was opened",
        at: "2026-11-07T11:04:00.000Z",
      },
    ],
  },
  {
    id: "CO-2026-0004",
    jobReference: "J-2026-2B51",
    quoteReference: "Q-2026-0001",
    jobTitle: "Kitchen radiator repositioning",
    customer: "S. Patel",
    customerInitials: "SP",
    city: "Leeds",
    currency: "GBP",
    status: "approved",
    kind: "variation",
    summary: "Move radiator to opposite wall at customer's request",
    reason:
      "Customer asked for the radiator to be moved to the chimney breast wall after the first fix was marked out. Includes draining down, extending the flow and return in 10mm, and re-hanging the existing radiator on new brackets.",
    lines: [
      {
        id: "cl1",
        description: "Drain down and extend flow and return",
        quantity: 1,
        unitPriceCents: 14500,
        direction: "add",
      },
      {
        id: "cl2",
        description: "Re-hang radiator on new brackets to chimney breast",
        quantity: 1,
        unitPriceCents: 5500,
        direction: "add",
      },
    ],
    baselineCents: 68000,
    issuedAt: "2026-11-04T09:00:00.000Z",
    validUntil: "2026-11-18T09:00:00.000Z",
    link: {
      url: "/q/2b7e4f1a8c3d5e9b6f2a4c8d1e7b3f5a",
      sentAt: "2026-11-04T09:02:00.000Z",
      sentTo: "",
      method: "copy",
    },
    decidedAt: "2026-11-05T08:30:00.000Z",
    activity: [
      {
        id: "e1",
        label: "Change order raised",
        detail: "Created from job J-2026-2B51",
        at: "2026-11-04T09:00:00.000Z",
      },
      {
        id: "e2",
        label: "Sent to customer",
        detail: "Approval link copied",
        at: "2026-11-04T09:02:00.000Z",
      },
      {
        id: "e3",
        label: "Approved by customer",
        detail: "Rolled into the job total",
        at: "2026-11-05T08:30:00.000Z",
      },
    ],
  },
  {
    id: "CO-2026-0003",
    jobReference: "J-2026-2B51",
    quoteReference: "Q-2026-0001",
    jobTitle: "Kitchen radiator repositioning",
    customer: "S. Patel",
    customerInitials: "SP",
    city: "Leeds",
    currency: "GBP",
    status: "approved",
    kind: "materials",
    summary: "Upgrade to thermostatic valves on both radiators",
    reason:
      "Existing valves were seized and could not be reused. Customer chose thermostatic valves over standard ones so the rooms can be controlled independently.",
    lines: [
      {
        id: "cl1",
        description: "Thermostatic radiator valve pack",
        quantity: 2,
        unitPriceCents: 3200,
        direction: "add",
      },
    ],
    baselineCents: 68000,
    issuedAt: "2026-11-03T14:10:00.000Z",
    validUntil: "2026-11-17T14:10:00.000Z",
    link: {
      url: "/q/6c1d9a4b7e2f8c5d3a6b1e9f4c7d2a8b",
      sentAt: "2026-11-03T14:12:00.000Z",
      sentTo: "",
      method: "copy",
    },
    decidedAt: "2026-11-04T07:45:00.000Z",
    activity: [
      {
        id: "e1",
        label: "Change order raised",
        detail: "Created from job J-2026-2B51",
        at: "2026-11-03T14:10:00.000Z",
      },
      {
        id: "e2",
        label: "Sent to customer",
        detail: "Approval link copied",
        at: "2026-11-03T14:12:00.000Z",
      },
      {
        id: "e3",
        label: "Approved by customer",
        detail: "Rolled into the job total",
        at: "2026-11-04T07:45:00.000Z",
      },
    ],
  },
  {
    id: "CO-2026-0002",
    jobReference: "J-2026-D7CC",
    quoteReference: "Q-2026-0003",
    jobTitle: "Outdoor tap and pipework",
    customer: "D. Wright",
    customerInitials: "DW",
    city: "Bath",
    currency: "GBP",
    status: "rejected",
    kind: "extra-work",
    summary: "Add second outdoor tap on the rear elevation",
    reason:
      "A second tap was added to the quote after the customer mentioned a new patio at the back of the house. Customer has since decided one tap is enough.",
    lines: [
      {
        id: "cl1",
        description: "Second outside tap with isolation and double check valve",
        quantity: 1,
        unitPriceCents: 12000,
        direction: "add",
      },
    ],
    baselineCents: 42000,
    issuedAt: "2026-11-02T11:30:00.000Z",
    validUntil: "2026-11-16T11:30:00.000Z",
    link: {
      url: "/q/9d2e5c8b1a4f7e3d6c9b2a5f8e1d4c7b",
      sentAt: "2026-11-02T11:32:00.000Z",
      sentTo: "",
      method: "copy",
    },
    decidedAt: "2026-11-06T16:20:00.000Z",
    rejectionReason: "Decided one tap is enough — happy with the original plan.",
    activity: [
      {
        id: "e1",
        label: "Change order raised",
        detail: "Created from job J-2026-D7CC",
        at: "2026-11-02T11:30:00.000Z",
      },
      {
        id: "e2",
        label: "Sent to customer",
        detail: "Approval link copied",
        at: "2026-11-02T11:32:00.000Z",
      },
      {
        id: "e3",
        label: "Rejected by customer",
        detail: "Decided one tap is enough",
        at: "2026-11-06T16:20:00.000Z",
      },
    ],
  },
  {
    id: "CO-2026-0001",
    jobReference: "J-2026-7709",
    quoteReference: "Q-2026-0002",
    jobTitle: "Bathroom refit — pipework and fixtures",
    customer: "A. Real Name",
    customerInitials: "AR",
    city: "Bristol",
    currency: "GBP",
    status: "approved",
    kind: "omission",
    summary: "Customer supplying their own shower valve — removed from scope",
    reason:
      "Customer found the shower valve they wanted and asked for it to be taken out of the quote. This credits the supply cost only; fitting is still included in the original scope.",
    lines: [
      {
        id: "cl1",
        description: "Credit — thermostatic shower valve supply",
        quantity: 1,
        unitPriceCents: 18500,
        direction: "credit",
      },
    ],
    baselineCents: 103500,
    issuedAt: "2026-11-01T08:45:00.000Z",
    validUntil: "2026-11-15T08:45:00.000Z",
    link: {
      url: "/q/4a8c2e6f9b1d3a5c7e9f2b4d6a8c1e3f",
      sentAt: "2026-11-01T08:47:00.000Z",
      sentTo: "",
      method: "copy",
    },
    decidedAt: "2026-11-01T19:10:00.000Z",
    activity: [
      {
        id: "e1",
        label: "Change order raised",
        detail: "Created from job J-2026-7709",
        at: "2026-11-01T08:45:00.000Z",
      },
      {
        id: "e2",
        label: "Sent to customer",
        detail: "Approval link copied",
        at: "2026-11-01T08:47:00.000Z",
      },
      {
        id: "e3",
        label: "Approved by customer",
        detail: "Credit applied to the job total",
        at: "2026-11-01T19:10:00.000Z",
      },
    ],
  },
];
