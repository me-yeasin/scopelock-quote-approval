"use client";

import { useState, useTransition } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { money } from "@/lib/quotes-types";
import { approveChange, rejectChange } from "./change-actions";

/* ------------------------------------------------------------------
   The customer's decision controls for a change order.

   Same forgiving behaviour as the quote page: reports what is happening,
   ignores a double tap, and explains a failure in place rather than
   throwing the customer back to a blank screen.
   ------------------------------------------------------------------ */

type Props = {
  token: string;
  currency: "GBP" | "EUR";
  newTotalCents: number;
  netCents: number;
};

export default function ChangeActions({ token, currency, newTotalCents, netCents }: Props) {
  const [pending, startTransition] = useTransition();
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onDone: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      setBusy(false);
      if (result.ok) onDone();
      else setError(result.error ?? "Something went wrong. Please try again.");
    });
  };

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
          <strong>{decided === "approved" ? "Change approved" : "Change declined"}</strong>
          <span>
            {decided === "approved"
              ? "The added work is agreed. Your plumber has been notified."
              : "Your plumber has been notified and will be in touch."}
          </span>
        </div>
      </div>
    );
  }

  if (rejecting) {
    return (
      <div className="cq-actions">
        <label className="cq-reject-label" htmlFor="c-reason">
          Let them know why (optional)
        </label>
        <textarea
          id="c-reason"
          className="cq-reject-input"
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, 500))}
          rows={3}
          placeholder="Not needed, too expensive, do it another time…"
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
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              setError(null);
            }}
          >
            Back
          </button>
          <button
            className="cq-btn cq-btn--danger"
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() =>
              run(() => rejectChange(token, reason), () => setDecided("rejected"))
            }
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
        onClick={() => run(() => approveChange(token), () => setDecided("approved"))}
      >
        <ShieldCheck size={18} strokeWidth={2.4} aria-hidden="true" />
        {busy || pending ? "Approving…" : "Approve this change"}
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
        Decline this change
      </button>
      {error ? (
        <p className="cq-actions-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="cq-actions-note">
        {netCents < 0
          ? `Approving credits ${money(Math.abs(netCents), currency)} — job total ${money(newTotalCents, currency)}.`
          : `Approving adds ${money(netCents, currency)} — job total ${money(newTotalCents, currency)}.`}
      </p>
    </div>
  );
}
