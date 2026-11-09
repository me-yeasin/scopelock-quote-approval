import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Lock, LinkIcon, ShieldCheck, X } from "lucide-react";
import { QUOTE_STATUS_LABEL, money } from "@/lib/quotes-types";
import { getPublicQuote, markQuoteViewed } from "./public-quote";
import CustomerActions from "./customer-actions-client";
import "./customer-quote.css";

export const metadata: Metadata = {
  title: "Your quote — ScopeLock",
  // The approval link carries a secret token; keep it out of search engines.
  robots: { index: false, follow: false },
};

/**
 * A token page is always rendered per request: the token decides which
 * quote a stranger is allowed to see, so there is nothing safe to cache
 * or prerender ahead of time.
 */
export const instant = false;

const TONE: Record<string, string> = {
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

/** Shared shell for the "can't show this" states. */
function Unavailable({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: "link" | "lock";
}) {
  return (
    <main className="cq">
      <div className="cq-empty">
        <div className="cq-empty-inner">
          <span className="cq-empty-icon" aria-hidden="true">
            {icon === "link" ? (
              <LinkIcon size={20} strokeWidth={2.2} />
            ) : (
              <Lock size={20} strokeWidth={2.2} />
            )}
          </span>
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
    </main>
  );
}

export default async function CustomerQuotePage(props: PageProps<"/q/[token]">) {
  const { token } = await props.params;
  const result = await getPublicQuote(token);

  if (!result.ok) {
    // A malformed or unknown token is a 404: there is nothing here, and
    // saying more would hint at which part was wrong.
    if (result.reason === "not-found") notFound();

    if (result.reason === "not-sent") {
      return (
        <Unavailable
          icon="lock"
          title="This quote isn't ready yet"
          body="Your plumber hasn't sent this quote. If you expected to see it, ask them to share the link again."
        />
      );
    }

    return (
      <Unavailable
        icon="link"
        title="Something went wrong"
        body="We couldn't load this quote just now. Please try again in a moment."
      />
    );
  }

  const quote = result.quote;

  // Best-effort view tracking. Awaited so the "viewed" entry lands before
  // the response is sent, but it swallows its own errors.
  if (quote.status === "sent") await markQuoteViewed(token);

  const subtotal = quote.subtotalCents;
  const total = subtotal + quote.approvedChangesCents;
  const decided = quote.status === "approved" || quote.status === "rejected";
  const expired = quote.status === "expired";
  const tone = TONE[quote.status] ?? "sent";

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
            <p className="cq-eyebrow">Quote {quote.reference}</p>
            <h1 className="cq-title">{quote.title}</h1>
            <p className="cq-meta">
              Prepared for <strong>{quote.customerName}</strong>
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
              <dd>{quote.city || "—"}</dd>
            </div>
            <div className="cq-fact">
              <dt>Job</dt>
              <dd>{quote.jobReference}</dd>
            </div>
          </dl>

          <ul className="cq-lines">
            {quote.lines.map((line, index) => (
              <li className="cq-line" key={`${line.description}-${index}`}>
                <div className="cq-line-top">
                  <span className="cq-line-desc">{line.description}</span>
                  <span className="cq-line-amount">
                    {money(
                      Math.round(line.quantity * line.unitPriceCents),
                      quote.currency,
                    )}
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
            {quote.approvedChangesCents > 0 ? (
              <div className="cq-total-row">
                <span>Approved changes</span>
                <span>{money(quote.approvedChangesCents, quote.currency)}</span>
              </div>
            ) : null}
            <div className="cq-total-row is-grand">
              <span>Total</span>
              <span className="cq-total-value">{money(total, quote.currency)}</span>
            </div>
            <p className="cq-total-note">
              Includes VAT where applicable. Nothing is added to this total
              without your approval.
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
                  {quote.status === "approved"
                    ? `Approved ${formatDate(quote.decidedAt ?? "")}. This price is now locked.`
                    : "This quote was declined. Ask your plumber for a revised quote."}
                </span>
              </div>
            </div>
          ) : null}

          {expired ? (
            <div className="cq-decided" data-tone="expired">
              <span className="cq-decided-icon" aria-hidden="true">
                <ShieldCheck size={18} strokeWidth={2.4} />
              </span>
              <div>
                <strong>This quote has expired</strong>
                <span>
                  It was valid until {formatDate(quote.validUntil)}. Ask your
                  plumber for an updated quote.
                </span>
              </div>
            </div>
          ) : null}
        </article>

        {quote.status === "sent" ? (
          <CustomerActions
            token={token}
            currency={quote.currency}
            totalCents={total}
          />
        ) : null}

        <p className="cq-foot">
          Questions about this quote? Reply to the message this link came from.
        </p>
      </div>
    </main>
  );
}
