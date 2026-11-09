"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  FileDiff,
  Link2,
  Lock,
  X,
} from "lucide-react";
import { Icon } from "../../app-shell";
import {
  CHANGE_KIND_LABEL,
  CHANGE_STATUS_LABEL,
  changeIsCredit,
  changeLineTotal,
  changeNet,
  changeNewTotal,
  type ChangeOrder,
  type ChangeOrderStatus,
} from "../../../lib/changes-types";
import { money } from "../../../lib/quotes-types";
import { deleteChange, sendChange, withdrawChange } from "./actions";

/* ------------------------------------------------------------------
   The change-order drawer.

   Reads top to bottom as the argument you make to a customer: what
   changed, why, what it costs, and what the job total becomes. The
   before/after block is the point of the screen — the customer's real
   question is never "what is this line item", it is "what will I owe
   now".
   ------------------------------------------------------------------ */

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function signed(cents: number, currency: "GBP" | "EUR") {
  if (cents === 0) return money(0, currency);
  const abs = Math.abs(cents);
  return cents > 0 ? `+${money(abs, currency)}` : `−${money(abs, currency)}`;
}

const STATUS_CLASS: Record<ChangeOrderStatus, string> = {
  draft: "draft",
  sent: "sent",
  approved: "approved",
  rejected: "rejected",
  expired: "expired",
  withdrawn: "rejected",
};

export default function ChangeDrawer({
  order: initialOrder,
  onClose,
  onChanged,
}: {
  order: ChangeOrder;
  onClose: () => void;
  onChanged: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Local copy so a send or decision shows immediately, without waiting
  // for the list behind the drawer to refetch.
  const [order, setOrder] = useState<ChangeOrder>(initialOrder);

  const net = changeNet(order);
  const credit = changeIsCredit(order);
  const newTotal = changeNewTotal(order);
  const isSent = order.status === "sent";
  const isDecided = order.status === "approved" || order.status === "rejected";
  const isDraft = order.status === "draft";
  // Closed orders accept no further action at all.
  const isClosed =
    order.status === "withdrawn" || order.status === "expired" || isDecided;

  // Escape closes; focus starts on Close so keyboard users are not trapped.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Copy the approval link, sending first if needed.
   *
   * A draft has no token yet, so this one button both marks the change as
   * sent and puts the URL on the clipboard — the same contract as the
   * quote drawer's "Copy link".
   */
  const handleCopyLink = async () => {
    if (busy) return;
    setActionError(null);

    let url = order.link?.url;

    if (!url) {
      setBusy(true);
      const result = await sendChange(order.id, "copy");
      setBusy(false);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      url = result.change.link?.url;
      setOrder(result.change);
      onChanged();
      if (!url) {
        setActionError("The approval link could not be generated. Try again.");
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(
        new URL(url, window.location.origin).toString(),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Could not copy automatically — select the link above and copy it.");
    }
  };

  const handleWithdraw = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    const result = await withdrawChange(order.id);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setOrder(result.change);
    onChanged();
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    const result = await deleteChange(order.id);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      setConfirmDelete(false);
      return;
    }
    onChanged();
    onClose();
  };

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" onClick={onClose} />
      <aside
        className="job-drawer is-open q-drawer ch-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Change order ${order.id}`}
      >
        <header className="q-drawer-head">
          <div style={{ minWidth: 0 }}>
            <p className="drawer-eyebrow">Change order {order.id}</p>
            <h2 className="q-drawer-title">{order.summary}</h2>
            <div className="q-drawer-meta">
              <span className={`status status-${STATUS_CLASS[order.status]}`}>
                <span className="status-dot" />
                {CHANGE_STATUS_LABEL[order.status]}
              </span>
              <span className="ch-dot" />
              <span>{CHANGE_KIND_LABEL[order.kind]}</span>
              <span className="ch-dot" />
              <span>{order.customer}</span>
            </div>
          </div>
          <div className="q-drawer-actions">
            <button
              ref={closeRef}
              className="icon-btn"
              type="button"
              aria-label="Close"
              onClick={onClose}
            >
              <Icon icon={X} />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          {/* ---------------- The money: before vs after ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">What this does to the price</h3>

            <div className="ch-impact">
              <div className="ch-impact-row">
                <span className="ch-impact-label">Approved quote</span>
                <span className="ch-impact-value">
                  {money(order.baselineCents, order.currency)}
                </span>
              </div>

              <div className={`ch-impact-row ch-impact-change ${credit ? "is-neg" : "is-pos"}`}>
                <span className="ch-impact-label">
                  <Icon
                    icon={credit ? ArrowDownRight : ArrowUpRight}
                    className="ico ico-xs"
                  />
                  This change
                </span>
                <span className="ch-impact-value">{signed(net, order.currency)}</span>
              </div>

              <div className="ch-impact-row ch-impact-new">
                <span className="ch-impact-label">
                  Job total
                  {!isDecided ? <span className="ch-impact-hint">if approved</span> : null}
                </span>
                <span className="ch-impact-value">
                  {money(newTotal, order.currency)}
                </span>
              </div>
            </div>

            {isSent ? (
              <p className="ch-impact-note">
                Not billable yet. The price only moves once the customer approves.
              </p>
            ) : order.status === "approved" ? (
              <p className="ch-impact-note is-ok">
                <Icon icon={CircleCheck} className="ico ico-xs" />
                Approved — already counted in the job total.
              </p>
            ) : order.status === "rejected" ? (
              <p className="ch-impact-note is-bad">
                <Icon icon={X} className="ico ico-xs" />
                Rejected — the job total is unchanged.
              </p>
            ) : (
              <p className="ch-impact-note">
                Draft — nothing is visible to the customer or billed.
              </p>
            )}
          </section>

          {/* ---------------- Why ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">Why it changed</h3>
            <p className="ch-reason">{order.reason}</p>
          </section>

          {/* ---------------- Line items ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">
              Work priced
              <span className="loading-note">
                {order.lines.length} {order.lines.length === 1 ? "item" : "items"}
              </span>
            </h3>

            <div className="q-lines">
              <div className="q-lines-head">
                <span>Description</span>
                <span className="t-right">Amount</span>
              </div>
              {order.lines.map((line) => {
                const total = changeLineTotal(line);
                return (
                  <div className="q-line" key={line.id}>
                    <div>
                      <div className="q-line-desc">{line.description}</div>
                      {line.quantity !== 1 || line.direction === "credit" ? (
                        <div className="q-line-qty">
                          {line.quantity} × {money(line.unitPriceCents, order.currency)}
                          {line.direction === "credit" ? " · credit" : ""}
                        </div>
                      ) : null}
                    </div>
                    <div className={`q-line-amount ${total < 0 ? "ch-neg" : ""}`}>
                      {signed(total, order.currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------------- Approval ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">
              Customer approval
              {order.link ? (
                <span className="loading-note">
                  Raised {formatDate(order.issuedAt)}
                </span>
              ) : null}
            </h3>

            {actionError ? (
              <div className="drawer-error" role="alert">
                <Icon icon={X} className="ico ico-sm" />
                {actionError}
              </div>
            ) : null}

            {isDecided ? (
              <div className={`ch-decided ${order.status === "rejected" ? "is-bad" : ""}`}>
                <Icon
                  icon={order.status === "approved" ? Lock : X}
                  className="ico ico-sm"
                />
                <span>
                  <strong>
                    {order.status === "approved" ? "Approved" : "Rejected"}
                  </strong>{" "}
                  by the customer on {formatDate(order.decidedAt ?? order.issuedAt)}.
                  {order.rejectionReason ? ` “${order.rejectionReason}”` : ""}
                </span>
              </div>
            ) : (
              <div className="q-link-card">
                <div className="q-link-status">
                  <Icon icon={order.link ? Link2 : FileDiff} className="ico ico-sm" />
                  {order.link
                    ? "Link ready — send it however you like"
                    : "Copy the link and send it to your customer"}
                </div>

                {order.link ? (
                  <div className="q-link-url">
                    <Icon icon={Link2} className="ico ico-sm" />
                    <code>{order.link.url}</code>
                  </div>
                ) : null}

                <div className="q-link-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={handleCopyLink}
                  >
                    <Icon icon={copied ? Check : Copy} className="ico ico-sm" />
                    {busy
                      ? "Preparing…"
                      : copied
                        ? "Link copied"
                        : isDraft
                          ? "Send & copy link"
                          : "Copy link"}
                  </button>
                </div>

                <p className="q-link-sent">
                  <Icon icon={Lock} className="ico ico-xs" />
                  {isSent
                    ? `Waiting on the customer · Expires ${formatDate(order.validUntil)}`
                    : `Customer has not seen this yet · Expires ${formatDate(order.validUntil)}`}
                </p>
              </div>
            )}
          </section>

          {/* ---------------- Context ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">Where this lives</h3>
            <div className="ch-context">
              <div className="ch-context-row">
                <span>Job</span>
                <span>
                  <strong>{order.jobTitle}</strong> · {order.jobReference}
                </span>
              </div>
              <div className="ch-context-row">
                <span>Baseline quote</span>
                <span>
                  <Link href="/quotes" className="ch-inline-link">
                    {order.quoteReference}
                    <Icon icon={ExternalLink} className="ico ico-xs" />
                  </Link>
                </span>
              </div>
              <div className="ch-context-row">
                <span>Site</span>
                <span>{order.city || "—"}</span>
              </div>
            </div>
          </section>

          {/* ---------------- History ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">History</h3>
            <div className="q-timeline">
              {order.activity.map((event) => (
                <div className="q-event" key={event.id}>
                  <span className="q-event-dot" aria-hidden="true" />
                  <div>
                    <p className="q-event-label">{event.label}</p>
                    <p className="q-event-detail">{event.detail}</p>
                  </div>
                  <span className="q-event-at">{formatDate(event.at)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="drawer-foot ch-drawer-foot">
          {confirmDelete ? (
            <>
              <span className="ch-confirm-text">
                Delete <strong>{order.id}</strong>? This cannot be undone.
              </span>
              <span className="ch-confirm-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={handleDelete}
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="ch-foot-left">
                <button className="btn btn-ghost" type="button" onClick={onClose}>
                  Close
                </button>
                {isDraft ? (
                  <button
                    className="btn btn-ghost btn-sm ch-withdraw"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete draft
                  </button>
                ) : null}
                {!isClosed && !isDraft ? (
                  <button
                    className="btn btn-ghost btn-sm ch-withdraw"
                    type="button"
                    disabled={busy}
                    onClick={handleWithdraw}
                  >
                    Withdraw
                  </button>
                ) : null}
              </span>
              {!isClosed ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={handleCopyLink}
                >
                  <Icon icon={copied ? Check : Copy} className="ico ico-sm" />
                  {copied ? "Link copied" : "Copy approval link"}
                </button>
              ) : null}
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
