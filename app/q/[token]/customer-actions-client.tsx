"use client";

import { useState, useTransition } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { money } from "@/lib/quotes-types";
import { approveQuote, rejectQuote } from "./customer-actions";

/* ------------------------------------------------------------------
   The customer's decision controls.

   Deliberately forgiving on a slow connection: the button reports what
   is happening, double taps are ignored, and a failure explains itself
   in place instead of throwing the customer back to a blank screen.
   ------------------------------------------------------------------ */

type Props = {
  token: string;
  currency: "GBP" | "EUR";
  totalCents: number;
};

export default function CustomerActions({ token, currency, totalCents }: Props) {
  const [pending, startTransition] = useTransition();
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const total = money(totalCents, currency);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onDone: () => void) => {
    if (busy) return; // guard against a double tap approving twice
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      setBusy(false);
      if (result.ok) {
        onDone();
      } else {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    });
  };

  // Success is terminal: the page swaps to the locked state on refresh, and
  // these local states cover the moment before that happens.
  if (decided) {
    return (
      <div className="cq-decided" data-tone={decided === "approved" ? "approved" : "rejected"}>
        <span className="cq-decided-icon" aria-hidden="true">
          {decided === "approved" ? (
            <Check size={18} strokeWidth={2.6} />
          ) : (
            <X size={18} strokeWidth={2.6} />
          )}
        </span>
        <div>
          <strong>
            {decided === "approved" ? "Quote approved" : "Quote declined"}
          </strong>
          <span>
            {decided === "approved"
              ? "The price is locked. Your plumber has been notified."
              : "Your plumber has been notified and will be in touch."}
          </span>
        </div>
      </div>
    );
  }

  if (rejecting) {
    return (
      <div className="cq-actions">
        <label className="cq-reject-label" htmlFor="cq-reason">
          Let them know why (optional)
        </label>
        <textarea
          id="cq-reason"
          className="cq-reject-input"
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, 500))}
          rows={3}
          placeholder="Too expensive, changed my mind, went elsewhere…"
          disabled={busy}
        />
        {error ? (
          <p className="cq-actions-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="cq-reject-buttons">
          <button
            className="cq-btn cq-btn--ghost"
            type="button"
            onClick={() => {
              setRejecting(false);
              setError(null);
            }}
            disabled={busy}
          >
            Back
          </button>
          <button
            className="cq-btn cq-btn--danger"
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => run(() => rejectQuote(token, reason), () => setDecided("rejected"))}
          >
            {busy ? "Sending…" : "Confirm decline"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cq-actions">
      <button
        className="cq-btn cq-btn--primary"
        type="button"
        disabled={busy || pending}
        aria-busy={busy || pending}
        onClick={() => run(() => approveQuote(token), () => setDecided("approved"))}
      >
        <ShieldCheck size={18} strokeWidth={2.4} aria-hidden="true" />
        {busy || pending ? "Approving…" : "Approve this quote"}
      </button>
      <button
        className="cq-btn cq-btn--ghost"
        type="button"
        disabled={busy || pending}
        onClick={() => {
          setRejecting(true);
          setError(null);
        }}
      >
        Ask a question instead
      </button>
      {error ? (
        <p className="cq-actions-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="cq-actions-note">Approving locks the price at {total}.</p>
    </div>
  );
}
