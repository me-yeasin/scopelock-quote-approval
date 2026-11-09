import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Check, FileDiff, Lock, X } from "lucide-react";
import { money } from "@/lib/quotes-types";
import { getPublicChange, markChangeViewed } from "./public-change";
import ChangeActions from "./change-actions-client";
import "../../q/[token]/customer-quote.css";

export const metadata: Metadata = {
  title: "Change to your quote — ScopeLock",
  robots: { index: false, follow: false },
};

/** Rendered per request: the token decides what a stranger may see. */
export const instant = false;

const KIND_LABEL: Record<string, string> = {
  "extra-work": "Extra work",
  variation: "Variation",
  omission: "Omission",
  materials: "Materials",
  delay: "Delay",
};

const TONE: Record<string, string> = {
  sent: "sent",
  approved: "approved",
  rejected: "rejected",
  expired: "expired",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Awaiting your approval",
  approved: "Approved",
  rejected: "Declined",
  expired: "Expired",
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

function signed(cents: number, currency: "GBP" | "EUR") {
  if (cents === 0) return money(0, currency);
  const abs = Math.abs(cents);
  return cents > 0 ? `+${money(abs, currency)}` : `−${money(abs, currency)}`;
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <main className="cq">
      <div className="cq-empty">
        <div className="cq-empty-inner">
          <span className="cq-empty-icon" aria-hidden="true">
            <FileDiff size={20} strokeWidth={2.2} />
          </span>
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
    </main>
  );
}

export default async function CustomerChangePage(props: PageProps<"/c/[token]">) {
  const { token } = await props.params;
  const result = await getPublicChange(token);

  if (!result.ok) {
    if (result.reason === "not-found") notFound();
    if (result.reason === "not-sent") {
      return (
        <Unavailable
          title="This change isn't ready yet"
          body="Your plumber hasn't sent this change. If you expected to see it, ask them to share the link again."
        />
      );
    }
    return (
      <Unavailable
        title="Something went wrong"
        body="We couldn't load this change just now. Please try again in a moment."
      />
    );
  }

  const change = result.change;
  if (change.status === "sent") await markChangeViewed(token);

  const decided = change.status === "approved" || change.status === "rejected";
  const expired = change.status === "expired";
  const credit = change.netCents < 0;
  const tone = TONE[change.status] ?? "sent";

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
            {STATUS_LABEL[change.status] ?? change.status}
          </span>
        </header>

        <article className="cq-card">
          <div className="cq-head">
            <p className="cq-eyebrow">
              Change {change.reference} · {KIND_LABEL[change.kind] ?? "Change"}
            </p>
            <h1 className="cq-title">{change.summary}</h1>
            <p className="cq-meta">
              For <strong>{change.jobTitle}</strong>
            </p>
          </div>

          <dl className="cq-facts">
            <div className="cq-fact">
              <dt>Raised</dt>
              <dd>{formatDate(change.issuedAt)}</dd>
            </div>
            <div className="cq-fact">
              <dt>Valid until</dt>
              <dd>{formatDate(change.validUntil)}</dd>
            </div>
            <div className="cq-fact">
              <dt>Prepared for</dt>
              <dd>{change.customerName || "—"}</dd>
            </div>
            <div className="cq-fact">
              <dt>Site</dt>
              <dd>{change.city || "—"}</dd>
            </div>
          </dl>

          {/* The money answer first: the customer's real question is what
              this does to their total, not what is in it. */}
          <div className="cq-totals">
            <div className="cq-total-row">
              <span>Your approved quote</span>
              <span>{money(change.baselineCents, change.currency)}</span>
            </div>
            <div className={`cq-total-row ${credit ? "is-credit" : "is-added"}`}>
              <span>
                {credit ? (
                  <ArrowDownRight size={13} strokeWidth={2.6} aria-hidden="true" />
                ) : (
                  <ArrowUpRight size={13} strokeWidth={2.6} aria-hidden="true" />
                )}{" "}
                This change
              </span>
              <span>{signed(change.netCents, change.currency)}</span>
            </div>
            <div className="cq-total-row is-grand">
              <span>New total</span>
              <span className="cq-total-value">
                {money(change.newTotalCents, change.currency)}
              </span>
            </div>
            <p className="cq-total-note">
              {decided
                ? "This is your agreed total."
                : "This total applies only if you approve the change below."}
            </p>
          </div>

          <ul className="cq-lines">
            {change.lines.map((line, index) => {
              const magnitude = Math.round(line.quantity * line.unitPriceCents);
              const total = line.direction === "credit" ? -magnitude : magnitude;
              return (
                <li className="cq-line" key={`${line.description}-${index}`}>
                  <div className="cq-line-top">
                    <span className="cq-line-desc">{line.description}</span>
                    <span className="cq-line-amount">{signed(total, change.currency)}</span>
                  </div>
                  {line.quantity !== 1 ? (
                    <p className="cq-line-qty">
                      {line.quantity} × {money(line.unitPriceCents, change.currency)}
                      {line.direction === "credit" ? " · credit" : ""}
                    </p>
                  ) : line.direction === "credit" ? (
                    <p className="cq-line-qty">credit</p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {change.reason ? (
            <section className="cq-notes">
              <h2>Why this is needed</h2>
              <p>{change.reason}</p>
            </section>
          ) : null}

          {decided ? (
            <div className="cq-decided" data-tone={tone}>
              <span className="cq-decided-icon" aria-hidden="true">
                {change.status === "approved" ? (
                  <Check size={18} strokeWidth={2.6} />
                ) : (
                  <X size={18} strokeWidth={2.6} />
                )}
              </span>
              <div>
                <strong>
                  {change.status === "approved"
                    ? "You approved this change"
                    : "You declined this change"}
                </strong>
                <span>
                  {change.status === "approved"
                    ? `Agreed ${formatDate(change.decidedAt ?? "")}. Your total is now ${money(change.newTotalCents, change.currency)}.`
                    : "Your original quote is unchanged."}
                </span>
              </div>
            </div>
          ) : null}

          {expired ? (
            <div className="cq-decided" data-tone="expired">
              <span className="cq-decided-icon" aria-hidden="true">
                <FileDiff size={18} strokeWidth={2.4} />
              </span>
              <div>
                <strong>This change has expired</strong>
                <span>
                  It was valid until {formatDate(change.validUntil)}. Ask your plumber
                  for an updated one.
                </span>
              </div>
            </div>
          ) : null}
        </article>

        {change.status === "sent" ? (
          <ChangeActions
            token={token}
            currency={change.currency}
            newTotalCents={change.newTotalCents}
            netCents={change.netCents}
          />
        ) : null}

        <p className="cq-foot">
          Questions about this change? Reply to the message this link came from.
        </p>
      </div>
    </main>
  );
}
