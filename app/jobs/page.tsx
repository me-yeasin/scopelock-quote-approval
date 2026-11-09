"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import AppShell, { Icon } from "../app-shell";
import {
  STATUS_LABEL,
  FILTERS,
  type Filter,
  type Job,
  type StatusKey,
} from "../../lib/jobs-data";
import {
  getJobs,
  updateJob,
  deleteJob,
  type DeleteJobResult,
  type UpdateJobResult,
  type JobFieldErrors,
} from "./actions";

const SUMMARY_ORDER: StatusKey[] = ["approved", "awaiting", "inprogress", "draft"];

/** Number of placeholder rows shown while the first page load is in flight. */
const SKELETON_ROWS = 6;

/* ------------------------------------------------------------------
   Loading skeleton — one row per placeholder, mirroring the table's
   real column widths so the layout does not shift when data lands.
   ------------------------------------------------------------------ */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <tr
          key={row}
          className="skeleton-row"
          style={{ "--row": row } as CSSProperties}
          aria-hidden="true"
        >
          <td className="cell-job">
            <span className="sk sk-title" />
            <span className="sk sk-sub" />
          </td>
          <td>
            <span className="sk-customer">
              <span className="sk-avatar" />
              <span className="sk sk-text" style={{ width: 92 }} />
            </span>
          </td>
          <td className="t-right">
            <span className="sk sk-num" />
          </td>
          <td className="t-right">
            <span className="sk sk-num" style={{ width: 40 }} />
          </td>
          <td className="t-right">
            <span className="sk sk-num" />
          </td>
          <td>
            <span className="sk sk-pill" />
          </td>
          <td className="t-right">
            <span className="sk sk-num" style={{ width: 48 }} />
          </td>
          <td className="t-right">
            <span className="sk-actions">
              <span className="sk sk-icon" />
              <span className="sk sk-icon" />
            </span>
          </td>
        </tr>
      ))}
    </>
  );
}

/** How the drawer was opened — decides its initial mode. */
type DrawerIntent = "edit" | "delete";

type EditableJob = Pick<Job, "title" | "customer" | "city" | "status">;

function toEditable(job: Job): EditableJob {
  return {
    title: job.title,
    customer: job.customer,
    city: job.city,
    status: job.status,
  };
}

/* ------------------------------------------------------------------
   Job drawer — view / edit / delete a single job
   Keyed by job id so it remounts and resets its draft per job.
   ------------------------------------------------------------------ */
function JobDrawer({
  job,
  intent,
  onClose,
  onSave,
  onDelete,
}: {
  job: Job;
  intent: DrawerIntent;
  onClose: () => void;
  onSave: (
    next: EditableJob,
    expectedUpdatedAt: string | undefined,
  ) => Promise<UpdateJobResult>;
  onDelete: () => Promise<DeleteJobResult>;
}) {
  const [draft, setDraft] = useState<EditableJob>(() => toEditable(job));
  // "delete" starts in the confirm step; "edit" starts on the form.
  const [confirming, setConfirming] = useState(intent === "delete");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<JobFieldErrors>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  const original = useMemo(() => toEditable(job), [job]);
  const dirty =
    draft.title !== original.title ||
    draft.customer !== original.customer ||
    draft.city !== original.city ||
    draft.status !== original.status;

  useEffect(() => {
    if (confirming) {
      cancelDeleteRef.current?.focus();
    } else {
      titleRef.current?.focus();
    }
  }, [confirming]);

  // Escape cancels the delete confirmation first, then closes the drawer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (confirming) setConfirming(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirming, onClose]);

  const update = (patch: Partial<EditableJob>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    // Clear a field error as soon as the user edits that field.
    setFields((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof EditableJob)[]) delete next[key];
      return next;
    });
    setError(null);
  };

  const handleSave = async () => {
    if (saving || deleting || !dirty) return;
    setError(null);
    setFields({});
    setSaving(true);
    const result = await onSave(draft, job.updatedAt);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      if (result.fields) setFields(result.fields);
    }
    // On success the parent closes the drawer.
  };

  const handleDelete = async () => {
    if (deleting) return;
    setError(null);
    setDeleting(true);
    const result = await onDelete();
    setDeleting(false);
    if (!result.ok) {
      setError(result.error);
      setConfirming(false);
    }
    // On success the parent closes the drawer.
  };

  const busy = saving || deleting;

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" onClick={onClose} />
      <aside
        className="job-drawer is-open"
        role="dialog"
        aria-modal="true"
        aria-label={`Job ${job.id}`}
      >
        <header className="drawer-head">
          <div className="drawer-head-copy">
            <p className="drawer-eyebrow">Job {job.id}</p>
            <input
              ref={titleRef}
              className="drawer-title-input"
              value={draft.title}
              aria-label="Job title"
              aria-invalid={fields.title ? true : undefined}
              aria-describedby={fields.title ? "jd-title-error" : undefined}
              disabled={busy}
              onChange={(event) => update({ title: event.target.value })}
            />
            {fields.title ? (
              <p className="field-error" id="jd-title-error" role="alert">
                {fields.title}
              </p>
            ) : null}
          </div>
          <button
            className="icon-btn"
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <Icon icon={X} />
          </button>
        </header>

        <div className="drawer-body">
          <div className="field">
            <label className="field-label" htmlFor="jd-customer">
              Customer
            </label>
            <input
              id="jd-customer"
              className="field-input"
              value={draft.customer}
              aria-invalid={fields.customer ? true : undefined}
              aria-describedby={fields.customer ? "jd-customer-error" : undefined}
              disabled={busy}
              onChange={(event) => update({ customer: event.target.value })}
            />
            {fields.customer ? (
              <p className="field-error" id="jd-customer-error" role="alert">
                {fields.customer}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="jd-city">
              City
            </label>
            <input
              id="jd-city"
              className="field-input"
              value={draft.city}
              aria-invalid={fields.city ? true : undefined}
              aria-describedby={fields.city ? "jd-city-error" : undefined}
              disabled={busy}
              onChange={(event) => update({ city: event.target.value })}
            />
            {fields.city ? (
              <p className="field-error" id="jd-city-error" role="alert">
                {fields.city}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="jd-status">
              Status
            </label>
            <div className="select-wrap">
              <select
                id="jd-status"
                className="field-input"
                value={draft.status}
                disabled={busy}
                onChange={(event) => update({ status: event.target.value as StatusKey })}
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-grid">
            <div className="field">
              <span className="field-label">Quote</span>
              <span className="field-static num">{job.quote}</span>
            </div>
            <div className="field">
              <span className="field-label">Total</span>
              <span className="field-static num">{job.total}</span>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Change order</span>
            <span className={`change ${job.changeTone}`}>{job.change}</span>
          </div>

          <div className="field">
            <span className="field-label">Last updated</span>
            <span className="field-static">{job.updated}</span>
          </div>

          {error ? (
            <div className="drawer-error" role="alert">
              <Icon icon={X} className="ico ico-sm" />
              {error}
            </div>
          ) : null}
        </div>

        <footer className="drawer-foot">
          {confirming ? (
            <div className="confirm-bar" role="alert">
              <span className="confirm-text">
                Delete <strong>{job.title}</strong>? This cannot be undone.
              </span>
              <div className="confirm-actions">
                <button
                  ref={cancelDeleteRef}
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-danger"
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              <Icon icon={Trash2} className="ico ico-sm" />
              Delete job
            </button>
          )}

          <div className="drawer-foot-right">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !dirty}
              onClick={handleSave}
            >
              {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------
   Jobs screen
   ------------------------------------------------------------------ */
function JobsScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; intent: DrawerIntent } | null>(
    null,
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // Deep link: /jobs?job=<reference> opens that job's drawer on arrival.
  // This is what the "Open job" button on a quote uses.
  const searchParams = useSearchParams();
  const deepLinkRef = searchParams.get("job");
  const deepLinkHandled = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await getJobs();
      if (!active) return;
      if (result.ok) {
        setJobs(result.jobs);
      } else {
        setLoadError(result.error);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const visibleJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesFilter = filter === "all" || job.status === filter;
      const matchesQuery =
        !needle ||
        `${job.title} ${job.id} ${job.city} ${job.customer} ${STATUS_LABEL[job.status]}`
          .toLowerCase()
          .includes(needle);

      return matchesFilter && matchesQuery;
    });
  }, [jobs, filter, query]);

  const counts = useMemo(() => {
    const base: Record<StatusKey, number> = {
      approved: 0,
      awaiting: 0,
      inprogress: 0,
      draft: 0,
    };
    for (const job of jobs) base[job.status] += 1;
    return base;
  }, [jobs]);

  const selectedJob = selected
    ? (jobs.find((job) => (job.objectId ?? job.id) === selected.id) ?? null)
    : null;

  // Once the jobs have loaded, open the job named in the URL — exactly once,
  // so closing the drawer does not immediately re-open it.
  useEffect(() => {
    if (loading || !deepLinkRef) return;
    if (deepLinkHandled.current === deepLinkRef) return;

    const match = jobs.find((job) => job.id === deepLinkRef || job.objectId === deepLinkRef);
    deepLinkHandled.current = deepLinkRef;

    if (match) {
      setSelected({ id: match.objectId ?? match.id, intent: "edit" });
    }
  }, [loading, jobs, deepLinkRef]);

  // Writes target the stable storage id; the reference is only a fallback for
  // documents that predate it.
  const targetKey = (job: Job) => job.objectId ?? job.id;

  const handleSave = async (
    next: EditableJob,
    expectedUpdatedAt: string | undefined,
  ): Promise<UpdateJobResult> => {
    if (!selectedJob) return { ok: false, error: "No job selected." };
    const result = await updateJob(targetKey(selectedJob), {
      ...next,
      expectedUpdatedAt,
    });
    if (result.ok) {
      setJobs((prev) =>
        prev.map((job) => (targetKey(job) === targetKey(selectedJob) ? result.job : job)),
      );
      setSelected(null);
    }
    return result;
  };

  const handleDelete = async (): Promise<DeleteJobResult> => {
    if (!selectedJob) return { ok: false, error: "No job selected." };
    const key = targetKey(selectedJob);
    const result = await deleteJob(key);
    if (result.ok) {
      setJobs((prev) => prev.filter((job) => targetKey(job) !== key));
      setSelected(null);
    }
    return result;
  };

  return (
    <AppShell
      activeNav="jobs"
      breadcrumb={<span className="crumb-current">Jobs</span>}
      query={query}
      onQueryChange={setQuery}
      searchRef={searchRef}
    >
      <div className="page">
        <section className="page-head">
          <div className="page-head-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Trade workspace
            </p>
            <h1>Jobs</h1>
            <p className="lede">
              Every job you have scoped, quoted and delivered. Open one to review the quote,
              change orders and total — or delete a job you no longer need.
            </p>
          </div>

          <div className="page-actions">
            <Link href="/jobs/new" className="btn btn-primary">
              <Icon icon={Plus} className="ico ico-sm" />
              New job
            </Link>
          </div>
        </section>

        {loadError ? (
          <div className="jobs-banner" role="alert">
            <Icon icon={X} className="ico ico-sm" />
            <span>Could not load jobs — {loadError}</span>
          </div>
        ) : null}

        <div className="content">
          <section className="panel panel-jobs">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <h2>All jobs</h2>
                <span className="count">
                  {loading ? <span className="sk sk-count" aria-hidden="true" /> : jobs.length}
                </span>
              </div>

              <div className="panel-tools">
                <div className="segmented" role="group" aria-label="Filter jobs">
                  {FILTERS.map((option) => (
                    <button
                      key={option.id}
                      className={`seg${filter === option.id ? " is-active" : ""}`}
                      type="button"
                      aria-pressed={filter === option.id}
                      onClick={() => setFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? <div className="loading-bar" aria-hidden="true" /> : null}

            <div className="table-wrap">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">Customer</th>
                    <th scope="col" className="t-right">
                      Quote
                    </th>
                    <th scope="col" className="t-right">
                      Changes
                    </th>
                    <th scope="col" className="t-right">
                      Total
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col" className="t-right">
                      Updated
                    </th>
                    <th scope="col" className="t-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody aria-busy={loading}>
                  {loading ? (
                    <SkeletonRows />
                  ) : visibleJobs.length === 0 ? (
                    <tr className="empty-row">
                      <td colSpan={8}>
                        {jobs.length === 0
                          ? "No jobs yet. Create your first job to get started."
                          : "No jobs match this filter."}
                      </td>
                    </tr>
                  ) : (
                    visibleJobs.map((job) => {
                      const key = targetKey(job);
                      return (
                        <tr key={key} data-status={job.status}>
                          <td className="cell-job">
                            <button
                              type="button"
                              className="job-open"
                              onClick={() => setSelected({ id: key, intent: "edit" })}
                            >
                              <span className="job-title">{job.title}</span>
                              <span className="job-sub">
                                #{job.id} <span className="sep-dot" /> {job.city}
                              </span>
                            </button>
                          </td>
                          <td>
                            <span className="customer">
                              <span className="avatar">{job.initials}</span>
                              {job.customer}
                            </span>
                          </td>
                          <td className="t-right num">{job.quote}</td>
                          <td className="t-right">
                            <span className={`change ${job.changeTone}`}>{job.change}</span>
                          </td>
                          <td className="t-right">
                            <span className="total num">{job.total}</span>
                          </td>
                          <td>
                            <span
                              className={`status status-${
                                job.status === "inprogress" ? "progress" : job.status
                              }`}
                            >
                              <span className="status-dot" />
                              {STATUS_LABEL[job.status]}
                            </span>
                          </td>
                          <td className="t-right cell-time">{job.updated}</td>
                          <td className="t-right">
                            <div className="row-actions">
                              <button
                                type="button"
                                className="icon-btn-mini"
                                aria-label={`Edit ${job.title}`}
                                title="Edit"
                                onClick={() => setSelected({ id: key, intent: "edit" })}
                              >
                                <Icon icon={Pencil} className="ico ico-sm" />
                              </button>
                              <button
                                type="button"
                                className="icon-btn-mini danger"
                                aria-label={`Delete ${job.title}`}
                                title="Delete"
                                onClick={() => setSelected({ id: key, intent: "delete" })}
                              >
                                <Icon icon={Trash2} className="ico ico-sm" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel-foot">
              <span className="foot-note">
                {loading ? (
                  <span className="loading-note" role="status" aria-live="polite">
                    <span className="dot-pulse" aria-hidden="true" />
                    Loading jobs…
                  </span>
                ) : (
                  `Showing ${visibleJobs.length} of ${jobs.length} jobs`
                )}
              </span>
              <Link href="/jobs/new" className="link">
                New job
                <Icon icon={ArrowRight} className="ico ico-xs" />
              </Link>
            </div>
          </section>

          <aside className="rail">
            <section className="panel jobs-summary">
              <div className="panel-head">
                <div className="panel-title-wrap">
                  <h2>Jobs at a glance</h2>
                </div>
              </div>

              <ul className="summary">
                <li className="summary-row summary-total">
                  <span className="summary-dot total" aria-hidden="true" />
                  <span className="summary-name">All jobs</span>
                  <span className="summary-val num">
                    {loading ? <span className="sk sk-count" aria-hidden="true" /> : jobs.length}
                  </span>
                </li>
                {SUMMARY_ORDER.map((status) => (
                  <li className="summary-row" key={status}>
                    <span className={`summary-dot ${status}`} aria-hidden="true" />
                    <span className="summary-name">{STATUS_LABEL[status]}</span>
                    <span className="summary-val num">
                      {loading ? <span className="sk sk-count" aria-hidden="true" /> : counts[status]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>

      {selectedJob && selected ? (
        <JobDrawer
          key={selectedJob.objectId ?? selectedJob.id}
          job={selectedJob}
          intent={selected.intent}
          onClose={() => setSelected(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : null}
    </AppShell>
  );
}

/* `useSearchParams` must sit inside a Suspense boundary so the rest of the
   page can still be prerendered (see Next.js docs on use-search-params). */
export default function JobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsScreen />
    </Suspense>
  );
}
