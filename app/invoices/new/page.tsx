"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ReceiptText } from "lucide-react";
import AppShell, { Icon } from "../../app-shell";
import { money } from "../../../lib/quotes-types";
import { createInvoice, getInvoiceableJobs } from "../actions";
import "./new-invoice.css";

/* ------------------------------------------------------------------
   New invoice.

   Only jobs with an approved quote and no invoice yet can be chosen. The
   server re-checks both rules, so this list is a convenience rather than
   the guard.
   ------------------------------------------------------------------ */

type Eligible = Awaited<ReturnType<typeof getInvoiceableJobs>>[number];

const TERM_PRESETS = [0, 7, 14, 30];

export default function NewInvoicePage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Eligible[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [termsDays, setTermsDays] = useState(14);
  const [notes, setNotes] = useState(
    "Payment by bank transfer within 14 days of issue. Please quote the invoice number as your reference.",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await getInvoiceableJobs();
      setJobs(list);
      if (list.length > 0) setSelected(list[0].jobReference);
    } catch {
      setError("Could not load invoiceable jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = jobs.find((job) => job.jobReference === selected) ?? null;

  const submit = async () => {
    if (saving || !selected) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createInvoice({ jobReference: selected, termsDays, notes });
      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }
      // Stay in the flow: land on the list with the new invoice ready to open.
      router.push("/invoices");
      router.refresh();
    } catch {
      setError("Could not create the invoice. Try again.");
      setSaving(false);
    }
  };

  return (
    <AppShell
      activeNav="invoices"
      breadcrumb={
        <>
          <Link href="/invoices" className="crumb-link">
            Invoices
          </Link>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">New</span>
        </>
      }
    >
      <div className="page new-invoice-page">
        <section className="page-head">
          <div className="page-head-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              One invoice per job
            </p>
            <h1>New invoice</h1>
            <p className="lede">
              Pick an approved job. The invoice stays live — approving a change order
              later updates it automatically.
            </p>
          </div>
          <div className="page-actions">
            <Link href="/invoices" className="btn btn-ghost">
              <Icon icon={ArrowLeft} className="ico ico-sm" />
              Back
            </Link>
          </div>
        </section>

        {error ? (
          <div className="inline-error" role="alert">
            <Icon icon={AlertTriangle} className="ico ico-sm" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="ni-grid">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <h2>Choose a job</h2>
                <span className="count">
                  {loading ? <span className="sk sk-count" aria-hidden="true" /> : jobs.length}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="ni-list">
                {[0, 1, 2].map((i) => (
                  <div className="ni-option is-skeleton" key={i}>
                    <span className="sk sk-title" />
                    <span className="sk sk-sub" />
                  </div>
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="q-empty">
                <span className="q-empty-mark">
                  <Icon icon={ReceiptText} className="ico" />
                </span>
                <h3>Nothing to invoice yet</h3>
                <p>
                  A job can be invoiced once its quote is approved and it has no invoice.
                  Approve a quote first, or check an existing invoice.
                </p>
                <Link href="/quotes" className="btn btn-primary btn-sm">
                  Go to quotes
                </Link>
              </div>
            ) : (
              <div className="ni-list" role="radiogroup" aria-label="Job to invoice">
                {jobs.map((job) => {
                  const active = job.jobReference === selected;
                  return (
                    <button
                      key={job.jobReference}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`ni-option${active ? " is-active" : ""}`}
                      onClick={() => setSelected(job.jobReference)}
                    >
                      <span className="ni-radio" aria-hidden="true">
                        {active ? <Icon icon={CheckCircle2} className="ico ico-sm" /> : null}
                      </span>
                      <span className="ni-option-main">
                        <span className="ni-option-title">{job.jobTitle || job.jobReference}</span>
                        <span className="ni-option-sub">
                          {job.jobReference} · {job.customer}
                          {job.city ? ` · ${job.city}` : ""}
                        </span>
                      </span>
                      <span className="ni-option-amount">
                        {money(job.baselineCents + job.approvedChangesCents, job.currency as "GBP")}
                        {job.pendingChangesCents !== 0 ? (
                          <span className="ni-option-pending">
                            +{money(job.pendingChangesCents, job.currency as "GBP")} pending
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <h2>Terms</h2>
              </div>
            </div>

            <div className="ni-form">
              <label className="ni-field">
                <span className="ni-label">Payment terms</span>
                <div className="ni-presets">
                  {TERM_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={`seg${termsDays === days ? " is-active" : ""}`}
                      aria-pressed={termsDays === days}
                      onClick={() => setTermsDays(days)}
                    >
                      {days === 0 ? "On receipt" : `${days} days`}
                    </button>
                  ))}
                </div>
              </label>

              <label className="ni-field">
                <span className="ni-label">Notes on the invoice</span>
                <textarea
                  className="ni-textarea"
                  rows={5}
                  maxLength={1200}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>

              {chosen ? (
                <div className="ni-summary">
                  <div className="ni-summary-row">
                    <span>Agreed quote</span>
                    <span>{money(chosen.baselineCents, chosen.currency as "GBP")}</span>
                  </div>
                  {chosen.approvedChangesCents !== 0 ? (
                    <div className="ni-summary-row is-pos">
                      <span>Approved changes</span>
                      <span>
                        +{money(chosen.approvedChangesCents, chosen.currency as "GBP")}
                      </span>
                    </div>
                  ) : null}
                  <div className="ni-summary-total">
                    <span>Invoice total</span>
                    <span>
                      {money(
                        chosen.baselineCents + chosen.approvedChangesCents,
                        chosen.currency as "GBP",
                      )}
                    </span>
                  </div>
                  {chosen.pendingChangesCents !== 0 ? (
                    <p className="ni-summary-note">
                      {money(chosen.pendingChangesCents, chosen.currency as "GBP")} of changes are
                      still awaiting approval and will not be billed until agreed.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <button
                className="btn btn-primary ni-submit"
                type="button"
                disabled={!selected || saving || jobs.length === 0}
                aria-busy={saving}
                onClick={() => void submit()}
              >
                {saving ? "Creating…" : "Create invoice"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
