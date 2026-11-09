import type { Invoice } from "./invoices-types";

/* ------------------------------------------------------------------
   Sample invoices for the UI pass.

   Each object is exactly what the live query will produce from a job's
   approved quote plus its approved change orders — so wiring the real
   source is a swap of this array, not a rewrite of the screen.

   Dates are fixed ISO strings, never `Date.now()`: Next.js 16 rejects
   uncached clock reads during prerender of a Client Component.
   ------------------------------------------------------------------ */

const BUSINESS = {
  name: "Markham & Sons Plumbing",
  address: "14 Alma Road, Bristol BS6 6DL",
  email: "hello@markhamandsons.co.uk",
  phone: "0117 496 0182",
  vatNumber: "GB 418 552 907",
};

export const INVOICES: Invoice[] = [
  {
    id: "INV-2026-0003",
    jobReference: "J-2026-7709",
    jobTitle: "Bathroom refit — pipework and fixtures",
    customer: "A. Real Name",
    customerInitials: "AR",
    customerEmail: "a.realname@example.com",
    city: "Bristol",
    currency: "GBP",
    status: "issued",
    lines: [
      {
        id: "q1",
        description: "Remove existing suite and cap services",
        quantity: 1,
        unitPriceCents: 18000,
        direction: "add",
        source: "quote",
      },
      {
        id: "q2",
        description: "First-fix pipework for basin, WC and shower — 15mm copper to 22mm stack",
        quantity: 1,
        unitPriceCents: 42500,
        direction: "add",
        source: "quote",
      },
      {
        id: "q3",
        description: "Fit client-supplied basin, WC and thermostatic shower valve",
        quantity: 2,
        unitPriceCents: 21500,
        direction: "add",
        source: "quote",
      },
      {
        id: "c1",
        description: "Cut out and replace corroded cast-iron section in PVC",
        quantity: 1,
        unitPriceCents: 28000,
        direction: "add",
        source: "change",
        changeReference: "CO-2026-0005",
        changeSummary: "Replace corroded section of soil stack",
      },
      {
        id: "c2",
        description: "Credit — thermostatic shower valve supply",
        quantity: 1,
        unitPriceCents: 18500,
        direction: "credit",
        source: "change",
        changeReference: "CO-2026-0001",
        changeSummary: "Customer supplying their own shower valve",
      },
    ],
    baselineCents: 103500,
    approvedChangesCents: 9500,
    pendingChangesCents: 43500,
    issuedAt: "2026-11-07T09:00:00.000Z",
    dueAt: "2026-11-21T09:00:00.000Z",
    notes:
      "Payment by bank transfer within 14 days of issue. Please quote the invoice number as your reference.",
    business: BUSINESS,
  },
  {
    id: "INV-2026-0002",
    jobReference: "J-2026-2B51",
    jobTitle: "Kitchen radiator repositioning",
    customer: "S. Patel",
    customerInitials: "SP",
    customerEmail: "s.patel@example.com",
    city: "Leeds",
    currency: "GBP",
    status: "paid",
    lines: [
      {
        id: "q1",
        description: "Drain down and reposition radiator to chimney breast",
        quantity: 1,
        unitPriceCents: 68000,
        direction: "add",
        source: "quote",
      },
      {
        id: "c1",
        description: "Thermostatic radiator valve pack",
        quantity: 2,
        unitPriceCents: 3200,
        direction: "add",
        source: "change",
        changeReference: "CO-2026-0003",
        changeSummary: "Upgrade to thermostatic valves",
      },
    ],
    baselineCents: 68000,
    approvedChangesCents: 6400,
    pendingChangesCents: 0,
    issuedAt: "2026-11-04T10:00:00.000Z",
    dueAt: "2026-11-18T10:00:00.000Z",
    paidAt: "2026-11-06T14:20:00.000Z",
    notes: "Payment by bank transfer within 14 days of issue.",
    business: BUSINESS,
  },
  {
    id: "INV-2026-0001",
    jobReference: "J-2026-D7CC",
    jobTitle: "Outdoor tap and pipework",
    customer: "D. Wright",
    customerInitials: "DW",
    customerEmail: "d.wright@example.com",
    city: "Bath",
    currency: "GBP",
    status: "draft",
    lines: [
      {
        id: "q1",
        description: "Supply and fit outside tap with isolation and double check valve",
        quantity: 1,
        unitPriceCents: 42000,
        direction: "add",
        source: "quote",
      },
    ],
    baselineCents: 42000,
    approvedChangesCents: 0,
    pendingChangesCents: 12000,
    issuedAt: "2026-11-02T12:00:00.000Z",
    dueAt: "2026-11-16T12:00:00.000Z",
    notes: "Payment by bank transfer within 14 days of issue.",
    business: BUSINESS,
  },
];
