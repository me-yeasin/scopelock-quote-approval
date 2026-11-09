"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  CircleCheck,
  Clock,
  FileText,
  Link2,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { Icon } from "../app-shell";
import { useNow } from "./use-now";
import { sendQuote, updateQuote } from "./actions";
import QuoteEditForm, {
  toEditDraft,
  type EditDraft,
  type EditErrors,
} from "./quote-edit-form";
import {
  QUOTE_STATUS_LABEL,
  expiryNote,
  lineTotal,
  money,
  quoteBillable,
  quoteProjected,
  quoteSubtotal,
  type Quote,
} from "../../lib/quotes-types";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function relative(iso: string, now: number | null) {
  if (now === null) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, now - then);
  const hour = 3_600_000;
  if (diff < hour) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / hour)} h ago`;
  const days = Math.round(diff / 86_400_000);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

const METHOD_ICON = { email: Mail, sms: MessageSquare, copy: Link2 } as const;

export default function QuoteDrawer({
  quote: initialQuote,
  onClose,
  onChanged,
}: {
  quote: Quote;
  onClose: () => void;
  onChanged: () => void;
}) {
  // The drawer keeps its own copy so a save can swap in the updated record
  // immediately, without waiting for the list behind it to refetch.
  const [quote, setQuote] = useState<Quote>(initialQuote);
  useEffect(() => {
    setQuote(initialQuote);
  }, [initialQuote]);

  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Editing state. `draft` is null while viewing.
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [editErrors, setEditErrors] = useState<EditErrors>({});
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const now = useNow();

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const statusClass =
    quote.status === "sent" ? "sent" : quote.status === "approved" ? "approved" : quote.status;

  const expiry = expiryNote(quote, now);
  const subtotal = quoteSubtotal(quote);
  // Billable total: baseline + approved changes. Using the bare baseline
  // here was why an approved change never appeared in the locked total.
  const total = quoteBillable(quote);
  const projected = quoteProjected(quote);
  const isLocked = quote.status === "approved";
  // Approved and rejected quotes are frozen: their figures are the record.
  const isFrozen = isLocked || quote.status === "rejected";
  const editing = draft !== null;

  const startEdit = () => {
    setActionError(null);
    setEditErrors({});
    setDraft(toEditDraft(quote));
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditErrors({});
    setActionError(null);
  };

  /**
   * Save the draft in one click.
   *
   * Writes to the database, then swaps in the stored record and returns to
   * the normal drawer view so the updated quote — and its fresh approval
   * link — are immediately available to copy. No confirmation step.
   */
  const handleSave = async () => {
    if (!draft || saving) return;
    setActionError(null);
    setEditErrors({});
    setSaving(true);

    const result = await updateQuote(quote.id, {
      title: draft.title,
      customerName: draft.customerName,
      customerEmail: draft.customerEmail,
      customerPhone: draft.customerPhone,
      city: draft.city,
      currency: draft.currency,
      notes: draft.notes,
      validUntil: draft.validUntil,
      // Convert once, here: strings in the UI, integer minor units in the DB.
      lines: draft.lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity) || 0,
        unitPriceCents: Math.round((Number(line.unitPrice) || 0) * 100),
      })),
    });

    setSaving(false);

    if (!result.ok) {
      // Only genuine validation failures land here.
      setActionError(result.error);
      if (result.fieldErrors) setEditErrors(result.fieldErrors);
      return;
    }

    // Saved. Show the stored record and leave edit mode.
    setQuote(result.quote);
    setDraft(null);
    setEditErrors({});
    onChanged();
  };
  const MethodIcon = quote.link ? METHOD_ICON[quote.link.method] : Link2;

  /**
   * One action: get the customer a usable link.
   *
   * If the quote has not been sent yet, `sendQuote` issues the single-use
   * token, records the send on the quote, and flips draft -> sent. We simply
   * put the resulting link on the clipboard — ScopeLock never delivers the
   * message itself; the user sends it wherever they like.
   */
  const handleCopyLink = async () => {
    if (copying) return;
    setActionError(null);

    let url = quote.link?.url;

    // A draft is not "sent" until the link exists, so generate it now.
    if (!url) {
      setCopying(true);
      const result = await sendQuote(quote.id, "copy");
      setCopying(false);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      url = result.quote.link?.url;
      // Show the new status/link immediately, and refresh the list behind.
      setQuote(result.quote);
      onChanged();
      if (!url) {
        setActionError("The approval link could not be generated. Try again.");
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure context, permissions).
      setActionError("Could not copy automatically — select the link above and copy it.");
    }
  };

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" onClick={onClose} />
      <aside
        className="job-drawer is-open q-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Quote ${quote.id}`}
      >
        <header className="q-drawer-head">
          <div style={{ minWidth: 0 }}>
            <p className="drawer-eyebrow">Quote {quote.id}</p>
            <h2 className="q-drawer-title">{quote.title}</h2>
            <div className="q-drawer-meta">
              <span className={`status status-${statusClass}`}>
                <span className="status-dot" />
                {QUOTE_STATUS_LABEL[quote.status]}
              </span>
              <span className="sep-dot" style={{ width: 3, height: 3, borderRadius: "50%", background: "#CBD1C8" }} />
              <span>Job {quote.jobReference}</span>
              <span className="sep-dot" style={{ width: 3, height: 3, borderRadius: "50%", background: "#CBD1C8" }} />
              <span>{quote.customer}</span>
            </div>
          </div>
          <div className="q-drawer-actions">
            {!isFrozen && !editing ? (
              <button className="icon-btn" type="button" aria-label="Edit quote" title="Edit quote" onClick={startEdit}>
                <Icon icon={Pencil} />
              </button>
            ) : null}
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
          {editing && draft ? (
            <>
              {actionError ? (
                <div className="drawer-error" role="alert">
                  <Icon icon={X} className="ico ico-sm" />
                  {actionError}
                </div>
              ) : null}
              <QuoteEditForm
                draft={draft}
                errors={editErrors}
                disabled={saving}
                onChange={(next) => {
                  setDraft(next);
                  // Clear a field's error as soon as it is touched.
                  if (Object.keys(editErrors).length > 0) setEditErrors({});
                }}
              />
            </>
          ) : (
            <>
          {/* ---------------- Approval link ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">
              Customer approval
              {quote.link ? (
                <span className="loading-note">
                  <MethodIcon className="ico" />
                  Sent {relative(quote.link.sentAt, now)}
                </span>
              ) : null}
            </h3>

            {actionError ? (
              <div className="drawer-error" role="alert">
                <Icon icon={X} className="ico ico-sm" />
                {actionError}
              </div>
            ) : null}

            {isLocked ? (
              <div className="q-locked">
                <Icon icon={Lock} className="ico ico-sm" />
                <span>
                  <strong>Locked and approved</strong> on {formatDate(quote.decidedAt ?? quote.issuedAt)}.
                  This is now the baseline every change order is measured against.
                </span>
              </div>
            ) : (
              <div className="q-link-card">
                <div className="q-link-status">
                  <Icon icon={copying || quote.link ? Link2 : FileText} className="ico ico-sm" />
                  {copying
                    ? "Generating link…"
                    : quote.link
                      ? "Link ready — send it however you like"
                      : "Copy the link and send it to your customer"}
                </div>

                {quote.link ? (
                  <div className="q-link-url">
                    <Icon icon={Link2} className="ico ico-sm" />
                    <code>{quote.link.url}</code>
                  </div>
                ) : null}

                <div className="q-link-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={copying}
                    onClick={handleCopyLink}
                  >
                    <Icon icon={copied ? Check : Copy} className="ico ico-sm" />
                    {copying ? "Preparing…" : copied ? "Link copied" : "Copy link"}
                  </button>
                </div>

                <p className="q-link-sent">
                  <Icon icon={ShieldCheck} className="ico ico-xs" />
                  {quote.link
                    ? `Secure link, no account needed · Expires ${formatDate(quote.validUntil)}`
                    : `Approving this quote locks the scope · Expires ${formatDate(quote.validUntil)}`}
                </p>
              </div>
            )}
          </section>

          {/* ---------------- Line items ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">
              Line items
              <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                {quote.lines.length} {quote.lines.length === 1 ? "item" : "items"}
              </span>
            </h3>

            <div>
              <div className="q-lines-head">
                <span>Description</span>
                <span>Qty</span>
                <span>Amount</span>
              </div>
              <div className="q-lines">
                {quote.lines.map((line) => (
                  <div className="q-line" key={line.id}>
                    <span className="q-line-desc">{line.description}</span>
                    <span className="q-line-qty">{line.quantity}</span>
                    <span className="q-line-amount">{money(lineTotal(line), quote.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ---------------- Totals ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">What the customer owes</h3>

            <div className="q-totals">
              <div className="q-total-row">
                <span className="label">Original quote</span>
                <span className="val">{money(subtotal, quote.currency)}</span>
              </div>

              {quote.approvedChangesCents > 0 ? (
                <div className="q-total-row is-approved">
                  <span className="label">
                    <Icon icon={CircleCheck} className="ico ico-xs" />
                    Approved changes
                  </span>
                  <span className="val">+ {money(quote.approvedChangesCents, quote.currency)}</span>
                </div>
              ) : null}

              {quote.pendingChangesCents > 0 ? (
                <div className="q-total-row is-pending">
                  <span className="label">
                    <Icon icon={Clock} className="ico ico-xs" />
                    Pending changes
                  </span>
                  <span className="val">+ {money(quote.pendingChangesCents, quote.currency)}</span>
                </div>
              ) : null}

              {quote.status === "rejected" ? (
                <div className="q-total-row is-excluded">
                  <span className="label">Rejected — not billed</span>
                  <span className="val">{money(quoteBillable(quote), quote.currency)}</span>
                </div>
              ) : null}

              <div className="q-total-divider" />

              <div className="q-total-final">
                <span>{quote.status === "approved" ? "Locked total" : "Quote total"}</span>
                <span className="val">{money(total, quote.currency)}</span>
              </div>

              {quote.pendingChangesCents > 0 ? (
                <p className="q-total-hint">
                  If pending changes are approved, the job total becomes{" "}
                  <strong>{money(projected, quote.currency)}</strong>. Pending items are never
                  invoiced until the customer agrees.
                </p>
              ) : null}
            </div>

            {quote.status === "rejected" && quote.rejectionReason ? (
              <div className="drawer-error" role="note">
                <Icon icon={X} className="ico ico-sm" />
                Rejected: {quote.rejectionReason}
              </div>
            ) : null}
          </section>

          {/* ---------------- Notes ---------------- */}
          {quote.notes ? (
            <section className="q-section">
              <h3 className="q-section-title">Notes &amp; assumptions</h3>
              <p className="q-notes">{quote.notes}</p>
            </section>
          ) : null}

          {/* ---------------- Activity ---------------- */}
          <section className="q-section">
            <h3 className="q-section-title">History</h3>
            <div className="q-timeline">
              {quote.activity.map((event, index) => (
                <div
                  className={`q-event${index === 0 ? " is-key" : ""}`}
                  key={event.id}
                >
                  <span className="q-event-dot" aria-hidden="true" />
                  <div>
                    <div className="q-event-label">{event.label}</div>
                    <div className="q-event-detail">{event.detail}</div>
                  </div>
                  <span className="q-event-at">{relative(event.at, now)}</span>
                </div>
              ))}
            </div>
          </section>
            </>
          )}
        </div>

        <footer className="drawer-foot">
          {editing ? (
            <span className="q-total-hint">
              Saving updates the linked job total too
            </span>
          ) : (
            <span className="q-total-hint">
              Issued {formatDate(quote.issuedAt)}
              {expiry ? ` · ${expiry.text}` : ""}
            </span>
          )}
          <div className="drawer-foot-right">
            {editing ? (
              <>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={saving}
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={saving}
                  aria-busy={saving}
                  onClick={handleSave}
                >
                  {saving ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" type="button" onClick={onClose}>
                  Close
                </button>
                <Link
                  className="btn btn-primary"
                  href={`/jobs?job=${encodeURIComponent(quote.jobReference)}`}
                  title={`Open job ${quote.jobReference}`}
                >
                  Open job
                </Link>
              </>
            )}
          </div>
        </footer>
      </aside>
    </>
  );
}
