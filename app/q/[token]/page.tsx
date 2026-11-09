import type { Metadata } from "next";
import { Check, Lock, ShieldCheck, X } from "lucide-react";
import {
  QUOTE_STATUS_LABEL,
  lineTotal,
  money,
  quoteSubtotal,
  type Quote,
} from "@/lib/quotes-types";
import "./customer-quote.css";

export const metadata: Metadata = {
  title: "Your quote — ScopeLock",
  // The approval link carries a secret token; keep it out of search engines.
  robots: { index: false, follow: false },
};

/**
 * A token page is always rendered per request: the token decides which
 * quote a stranger is allowed to see, so there is nothing safe to cache
 * or prerender ahead of time. `instant: false` tells Next.js this route
 * is allowed to block on its params instead of streaming a placeholder
 * that could never be correct.
 */
export const instant = false;

/* ------------------------------------------------------------------
   The customer-facing quote. UI only — no actions are wired yet.

   This is the page most visitors will ever see, and most will open it on
   a mid-range phone over a weak connection. So: one column, no client
   JavaScript, no fixed heights, and prices that align on a single axis.
   ------------------------------------------------------------------ */

const TONE: Record<Quote["status"], string> = {
  draft: "sent",
  sent: "sent",
  approved: "approved",
  rejected: "rejected",
  expired: "expired",
};

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* Sample content until the backend is connected. Shaped exactly like the
   real view model so swapping in a database read is a one-line change. */
const SAMPLE: Quote = {
  id: "Q-2026-0001",
  jobReference: "J-2026-7709",
  title: "Bathroom refit — pipework and fixtures",
  customer: "A Real Name",
  customerInitials: "AR",
  customerEmail: "",
  customerPhone: "",
  city: "Bristol",
  currency: "GBP",
  status: "sent",
  lines: [
    {
      id: "l1",
      description: "Remove existing suite and cap services",
      quantity: 1,
      unitPriceCents: 18000,
    },
    {
      id: "l2",
      description:
        "First-fix pipework for basin, WC and shower — 15mm copper to 22mm stack",
      quantity: 1,
      unitPriceCents: 42500,
    },
    {
      id: "l3",
      description: "Fit client-supplied basin, WC and thermostatic shower valve",
      quantity: 2,
      unitPriceCents: 21500,
    },
  ],
  approvedChangesCents: 0,
  pendingChangesCents: 0,
  notes:
    "Price assumes the floor is already up and the stopcock is accessible. Any hidden pipe damage found after the floor is lifted will be quoted separately before work continues — nothing is added to this total without your written approval.",
  issuedAt: "2026-11-05T09:00:00.000Z",
  validUntil: "2026-12-05T09:00:00.000Z",
  activity: [],
};

export default async function CustomerQuotePage(
  props: PageProps<"/q/[token]">,
) {
  // Consumed so the token is validated once the lookup exists; unused for now.
  await props.params;

  const quote = SAMPLE;
  const subtotal = quoteSubtotal(quote);
  const decided = quote.status === "approved" || quote.status === "rejected";
  const tone = TONE[quote.status];

  return (
    <main className="cq">
      <div className="cq-wrap">
        <header className="cq-top">
          <span className="cq-brand">
            <span className="cq-brand-mark" aria-hidden="true">
              <Lock size={14} strokeWidth={2.4} />
            </span>
            ScopeLock
          </span>
          <span className="cq-badge" data-tone={tone}>
            <span className="cq-badge-dot" aria-hidden="true" />
            {QUOTE_STATUS_LABEL[quote.status]}
          </span>
        </header>

        <article className="cq-card">
          <div className="cq-head">
            <p className="cq-eyebrow">Quote {quote.id}</p>
            <h1 className="cq-title">{quote.title}</h1>
            <p className="cq-meta">
              Prepared for <strong>{quote.customer}</strong>
            </p>
          </div>

          <dl className="cq-facts">
            <div className="cq-fact">
              <dt>Issued</dt>
              <dd>{formatDate(quote.issuedAt)}</dd>
            </div>
            <div className="cq-fact">
              <dt>Valid until</dt>
              <dd>{formatDate(quote.validUntil)}</dd>
            </div>
            <div className="cq-fact">
              <dt>Site</dt>
              <dd>{quote.city}</dd>
            </div>
            <div className="cq-fact">
              <dt>Job</dt>
              <dd>{quote.jobReference}</dd>
            </div>
          </dl>

          <ul className="cq-lines">
            {quote.lines.map((line) => (
              <li className="cq-line" key={line.id}>
                <div className="cq-line-top">
                  <span className="cq-line-desc">{line.description}</span>
                  <span className="cq-line-amount">
                    {money(lineTotal(line), quote.currency)}
                  </span>
                </div>
                {line.quantity !== 1 ? (
                  <p className="cq-line-qty">
                    {line.quantity} × {money(line.unitPriceCents, quote.currency)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="cq-totals">
            <div className="cq-total-row">
              <span>Subtotal</span>
              <span>{money(subtotal, quote.currency)}</span>
            </div>
            <div className="cq-total-row">
              <span>Changes approved so far</span>
              <span>{money(quote.approvedChangesCents, quote.currency)}</span>
            </div>
            <div className="cq-total-row is-grand">
              <span>Total</span>
              <span className="cq-total-value">
                {money(subtotal + quote.approvedChangesCents, quote.currency)}
              </span>
            </div>
            <p className="cq-total-note">
              Includes VAT where applicable. Pending changes are not billed
              until you approve them.
            </p>
          </div>

          {quote.notes ? (
            <section className="cq-notes">
              <h2>What this price assumes</h2>
              <p>{quote.notes}</p>
            </section>
          ) : null}

          {decided ? (
            <div className="cq-decided" data-tone={tone}>
              <span className="cq-decided-icon" aria-hidden="true">
                {quote.status === "approved" ? (
                  <Check size={18} strokeWidth={2.6} />
                ) : (
                  <X size={18} strokeWidth={2.6} />
                )}
              </span>
              <div>
                <strong>
                  {quote.status === "approved"
                    ? "You approved this quote"
                    : "You declined this quote"}
                </strong>
                <span>
                  This price is now locked. Any further work is agreed in
                  writing before it is billed.
                </span>
              </div>
            </div>
          ) : null}
        </article>

        {!decided ? (
          <div className="cq-actions">
            <button className="cq-btn cq-btn--primary" type="button">
              <ShieldCheck size={18} strokeWidth={2.4} aria-hidden="true" />
              Approve this quote
            </button>
            <button className="cq-btn cq-btn--ghost" type="button">
              Ask a question instead
            </button>
            <p className="cq-actions-note">
              Approving locks the price at{" "}
              {money(subtotal + quote.approvedChangesCents, quote.currency)}.
            </p>
          </div>
        ) : null}

        <p className="cq-foot">
          Sent by <strong>Markham &amp; Sons Plumbing</strong>
          <br />
          Questions? Reply to the message this link came from.
        </p>
      </div>
    </main>
  );
}
