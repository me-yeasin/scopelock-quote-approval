"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Plus, Trash2 } from "lucide-react";
import AppShell, { Icon } from "../../app-shell";
import {
  CHANGE_KIND_LABEL,
  changeNet,
  type ChangeKind,
} from "../../../lib/changes-types";
import { money } from "../../../lib/quotes-types";
import { createChange, getEligibleJobs, type EligibleJob } from "../actions";
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
  const router = useRouter();
  const [jobs, setJobs] = useState<EligibleJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobRef, setJobRef] = useState("");
  const [kind, setKind] = useState<ChangeKind>("extra-work");
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Only jobs with an approved quote can take a change, so the list comes
  // from the server rather than being guessed on the client.
  const load = useCallback(async () => {
    const result = await getEligibleJobs();
    if (result.ok) {
      setJobs(result.jobs);
      setJobRef((current) => current || (result.jobs[0]?.reference ?? ""));
    } else {
      setError(result.error);
    }
    setJobsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const job = jobs.find((j) => j.reference === jobRef);

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

  const baseline = job?.baselineCents ?? 0;
  const currency = job?.currency ?? "GBP";
  const newTotal = baseline + net;

  const handleSubmit = async (andCopy: boolean) => {
    if (saving) return;
    setError(null);
    setFieldErrors({});
    setSaving(true);

    const result = await createChange({
      jobReference: jobRef,
      kind,
      summary,
      reason,
      validUntil,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        direction: line.direction,
      })),
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      return;
    }

    // The new order exists; leave the form for the list, where its drawer
    // carries the Copy link button.
    router.push("/changes");
  };

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
                    disabled={jobsLoading || jobs.length === 0}
                    onChange={(event) => setJobRef(event.target.value)}
                  >
                    {jobsLoading ? <option value="">Loading jobs…</option> : null}
                    {!jobsLoading && jobs.length === 0 ? (
                      <option value="">No jobs with an approved quote yet</option>
                    ) : null}
                    {jobs.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.title} · {option.reference}
                      </option>
                    ))}
                  </select>
                  <p className="nc-hint">
                    {jobs.length === 0 && !jobsLoading
                      ? "A job needs an approved quote before it can take a change order."
                      : "Only jobs with an approved quote can be changed — that quote is the baseline."}
                  </p>
                  {fieldErrors.jobReference ? (
                    <p className="nc-error">{fieldErrors.jobReference}</p>
                  ) : null}
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
                  {fieldErrors.summary ? (
                    <p className="nc-error">{fieldErrors.summary}</p>
                  ) : null}
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
                  {fieldErrors.reason ? (
                    <p className="nc-error">{fieldErrors.reason}</p>
                  ) : null}
                </div>

                <div className="nc-field">
                  <label className="field-label" htmlFor="nc-valid">
                    Valid until
                  </label>
                  <input
                    id="nc-valid"
                    className="nc-input"
                    type="date"
                    value={validUntil}
                    onChange={(event) => setValidUntil(event.target.value)}
                  />
                  <p className="nc-hint">
                    After this date the link stops accepting a decision.
                  </p>
                  {fieldErrors.validUntil ? (
                    <p className="nc-error">{fieldErrors.validUntil}</p>
                  ) : null}
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
                            currency,
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
                    <span className="ch-impact-value">{money(baseline, currency)}</span>
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
                    <span className="ch-impact-value">
                      {net < 0 ? "−" : "+"}
                      {money(Math.abs(net), currency)}
                    </span>
                  </div>
                  <div className="ch-impact-row ch-impact-new">
                    <span className="ch-impact-label">Job total</span>
                    <span className="ch-impact-value">{money(newTotal, currency)}</span>
                  </div>
                </div>

                <p className="nc-side-note">
                  The customer sees this the moment they open the link. Once approved,
                  the change is locked in and billable.
                </p>

                <div className="nc-side-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={saving || jobs.length === 0}
                    aria-busy={saving}
                    onClick={() => handleSubmit(true)}
                  >
                    <Icon icon={Plus} className="ico ico-sm" />
                    {saving ? "Saving…" : "Raise change order"}
                  </button>
                  <Link href="/changes" className="btn btn-ghost nc-cancel">
                    Cancel
                  </Link>
                </div>
                {error ? (
                  <p className="nc-error nc-error-block" role="alert">
                    {error}
                  </p>
                ) : null}
                <p className="nc-side-hint">
                  Saves as a draft. Copy the link from the change order to send it.
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
