"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Plus, Trash2 } from "lucide-react";
import AppShell, { Icon } from "../../app-shell";
import {
  CHANGE_KIND_LABEL,
  changeNet,
  type ChangeKind,
} from "../../../lib/changes-types";
import { money } from "../../../lib/quotes-types";
import "../changes.css";
import "./new-change.css";

/* ------------------------------------------------------------------
   New change order — UI only.

   The form is organised in the order the argument is made: pick the job
   and the change type, price the work, then check the effect on the
   total before sending. The running total is always visible because
   that is the number the customer will react to.
   ------------------------------------------------------------------ */

const KINDS: ChangeKind[] = [
  "extra-work",
  "variation",
  "omission",
  "materials",
  "delay",
];

/** Jobs that already have an approved quote — only those can change. */
const ELIGIBLE_JOBS = [
  { reference: "J-2026-7709", title: "Bathroom refit — pipework and fixtures", quote: "Q-2026-0002", baseline: 103500 },
  { reference: "J-2026-2B51", title: "Kitchen radiator repositioning", quote: "Q-2026-0001", baseline: 68000 },
  { reference: "J-2026-D7CC", title: "Outdoor tap and pipework", quote: "Q-2026-0003", baseline: 42000 },
];

type Line = {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  direction: "add" | "credit";
};

let seq = 0;
const blankLine = (): Line => ({
  key: `l${++seq}`,
  description: "",
  quantity: "1",
  unitPrice: "",
  direction: "add",
});

export default function NewChangeOrderPage() {
  const [jobRef, setJobRef] = useState(ELIGIBLE_JOBS[0]?.reference ?? "");
  const [kind, setKind] = useState<ChangeKind>("extra-work");
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);

  const job = ELIGIBLE_JOBS.find((j) => j.reference === jobRef);

  const net = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = Number(line.quantity) || 0;
        const price = Math.round((Number(line.unitPrice) || 0) * 100);
        const magnitude = Math.round(qty * price);
        return sum + (line.direction === "credit" ? -magnitude : magnitude);
      }, 0),
    [lines],
  );

  const baseline = job?.baseline ?? 0;
  const newTotal = baseline + net;

  const update = (key: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  return (
    <AppShell
      activeNav="changes"
      breadcrumb={
        <>
          <Link href="/changes" className="crumb-link">
            Change orders
          </Link>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">New</span>
        </>
      }
    >
      <div className="page nc-page">
        <section className="page-head">
          <div className="page-head-copy">
            <Link href="/changes" className="nc-back">
              <Icon icon={ArrowLeft} className="ico ico-sm" />
              Back to change orders
            </Link>
            <h1>New change order</h1>
            <p className="lede">
              Price the change, then send it for approval. Nothing is billed and the
              job total does not move until the customer agrees.
            </p>
          </div>
        </section>

        <div className="nc-grid">
          {/* ---------------- Left: the form ---------------- */}
          <div className="nc-main">
            <section className="panel nc-panel">
              <div className="panel-head">
                <div className="panel-title-wrap">
                  <h2>What changed</h2>
                </div>
              </div>

              <div className="nc-body">
                <div className="nc-field">
                  <label className="field-label" htmlFor="nc-job">
                    Job
                  </label>
                  <select
                    id="nc-job"
                    className="nc-input"
                    value={jobRef}
                    onChange={(event) => setJobRef(event.target.value)}
                  >
                    {ELIGIBLE_JOBS.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.title} · {option.reference}
                      </option>
                    ))}
                  </select>
                  <p className="nc-hint">
                    Only jobs with an approved quote can be changed — that quote is the
                    baseline.
                  </p>
                </div>

                <div className="nc-field">
                  <span className="field-label">Type of change</span>
                  <div className="nc-kinds" role="group" aria-label="Type of change">
                    {KINDS.map((option) => (
                      <button
                        key={option}
                        className={`nc-kind${kind === option ? " is-active" : ""}`}
                        type="button"
                        aria-pressed={kind === option}
                        onClick={() => setKind(option)}
                      >
                        {CHANGE_KIND_LABEL[option]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="nc-field">
                  <label className="field-label" htmlFor="nc-summary">
                    One-line summary
                  </label>
                  <input
                    id="nc-summary"
                    className="nc-input"
                    placeholder="Replace corroded section of soil stack"
                    value={summary}
                    onChange={(event) => setSummary(event.target.value.slice(0, 120))}
                  />
                  <p className="nc-hint">This is what the customer sees first.</p>
                </div>

                <div className="nc-field">
                  <label className="field-label" htmlFor="nc-reason">
                    Why it is needed
                  </label>
                  <textarea
                    id="nc-reason"
                    className="nc-input nc-textarea"
                    rows={4}
                    placeholder="Explain what you found and why the extra work is needed."
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="panel nc-panel">
              <div className="panel-head">
                <div className="panel-title-wrap">
                  <h2>Priced work</h2>
                  <span className="count">{lines.length}</span>
                </div>
                <div className="panel-tools">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => setLines((current) => [...current, blankLine()])}
                  >
                    <Icon icon={Plus} className="ico ico-sm" />
                    Add item
                  </button>
                </div>
              </div>

              <div className="nc-lines">
                {lines.map((line, index) => (
                  <div className="nc-line" key={line.key}>
                    <div className="nc-line-head">
                      <span className="nc-line-num">Item {index + 1}</span>
                      <div className="nc-dir" role="group" aria-label="Adds or credits">
                        <button
                          className={`nc-dir-btn${line.direction === "add" ? " is-active" : ""}`}
                          type="button"
                          aria-pressed={line.direction === "add"}
                          onClick={() => update(line.key, { direction: "add" })}
                        >
                          <Icon icon={ArrowUpRight} className="ico ico-xs" />
                          Adds
                        </button>
                        <button
                          className={`nc-dir-btn${line.direction === "credit" ? " is-active" : ""}`}
                          type="button"
                          aria-pressed={line.direction === "credit"}
                          onClick={() => update(line.key, { direction: "credit" })}
                        >
                          <Icon icon={ArrowDownRight} className="ico ico-xs" />
                          Credits
                        </button>
                      </div>
                      {lines.length > 1 ? (
                        <button
                          className="icon-btn nc-line-remove"
                          type="button"
                          aria-label={`Remove item ${index + 1}`}
                          onClick={() =>
                            setLines((current) =>
                              current.filter((item) => item.key !== line.key),
                            )
                          }
                        >
                          <Icon icon={Trash2} className="ico ico-sm" />
                        </button>
                      ) : null}
                    </div>

                    <input
                      className="nc-input"
                      placeholder="What the work is"
                      value={line.description}
                      onChange={(event) =>
                        update(line.key, { description: event.target.value })
                      }
                    />

                    <div className="nc-line-bottom">
                      <label className="nc-mini">
                        <span>Qty</span>
                        <input
                          className="nc-input"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) =>
                            update(line.key, { quantity: event.target.value })
                          }
                        />
                      </label>
                      <label className="nc-mini">
                        <span>Unit price</span>
                        <input
                          className="nc-input"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={line.unitPrice}
                          onChange={(event) =>
                            update(line.key, { unitPrice: event.target.value })
                          }
                        />
                      </label>
                      <div className="nc-line-total">
                        <span>Line total</span>
                        <strong
                          className={line.direction === "credit" ? "ch-neg" : undefined}
                        >
                          {money(
                            Math.round(
                              Math.round((Number(line.unitPrice) || 0) * 100) *
                                (Number(line.quantity) || 0),
                            ) * (line.direction === "credit" ? -1 : 1),
                            "GBP",
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ---------------- Right: the running effect ---------------- */}
          <aside className="nc-side">
            <section className="panel nc-side-panel">
              <div className="panel-head">
                <div className="panel-title-wrap">
                  <h2>Effect on the job</h2>
                </div>
              </div>

              <div className="nc-impact">
                <div className="ch-impact">
                  <div className="ch-impact-row">
                    <span className="ch-impact-label">Approved quote</span>
                    <span className="ch-impact-value">{money(baseline, "GBP")}</span>
                  </div>
                  <div
                    className={`ch-impact-row ch-impact-change ${
                      net < 0 ? "is-neg" : "is-pos"
                    }`}
                  >
                    <span className="ch-impact-label">
                      <Icon
                        icon={net < 0 ? ArrowDownRight : ArrowUpRight}
                        className="ico ico-xs"
                      />
                      This change
                    </span>
                    <span className="ch-impact-value">{money(net, "GBP")}</span>
                  </div>
                  <div className="ch-impact-row ch-impact-new">
                    <span className="ch-impact-label">Job total</span>
                    <span className="ch-impact-value">{money(newTotal, "GBP")}</span>
                  </div>
                </div>

                <p className="nc-side-note">
                  The customer sees this the moment they open the link. Once approved,
                  the change is locked in and billable.
                </p>

                <div className="nc-side-actions">
                  <button className="btn btn-primary" type="button" disabled>
                    <Icon icon={Plus} className="ico ico-sm" />
                    Raise &amp; copy link
                  </button>
                  <button className="btn btn-ghost" type="button" disabled>
                    Save as draft
                  </button>
                </div>
                <p className="nc-side-hint">
                  Not connected to the database yet — this is the layout pass.
                </p>
              </div>
            </section>

            <section className="nc-side-card">
              <h3>What happens next</h3>
              <ol className="nc-steps">
                <li>
                  <strong>You send the link.</strong> The job total stays exactly as it is.
                </li>
                <li>
                  <strong>Customer approves.</strong> The change joins the job total and
                  becomes billable.
                </li>
                <li>
                  <strong>Nothing is added silently.</strong> A rejected or unanswered
                  change never affects the price.
                </li>
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
