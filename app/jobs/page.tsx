"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import AppShell, { Icon } from "../app-shell";
import {
  JOBS,
  STATUS_LABEL,
  FILTERS,
  type Filter,
  type Job,
  type StatusKey,
} from "../../lib/jobs-data";

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */
function initialsFrom(name: string) {
  return name
    .replace(/\./g, "")
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const SUMMARY_ORDER: StatusKey[] = ["approved", "awaiting", "inprogress", "draft"];

/* ------------------------------------------------------------------
   Job drawer — view / edit / delete a single job (UI only)
   Keyed by job id so it remounts and resets its draft per job.
   ------------------------------------------------------------------ */
function JobDrawer({
  job,
  onClose,
  onSave,
  onDelete,
}: {
  job: Job;
  onClose: () => void;
  onSave: (next: Job) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Job>(job);
  const [confirming, setConfirming] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const update = (patch: Partial<Job>) => setDraft((prev) => ({ ...prev, ...patch }));

  const handleSave = () => {
    onSave({
      ...draft,
      initials: initialsFrom(draft.customer),
    });
  };

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onDelete(job.id);
  };

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" onClick={onClose} />
      <aside className="job-drawer is-open" role="dialog" aria-modal="true" aria-label={`Job ${job.id}`}>
        <header className="drawer-head">
          <div className="drawer-head-copy">
            <p className="drawer-eyebrow">Job {job.id}</p>
            <input
              ref={titleRef}
              className="drawer-title-input"
              value={draft.title}
              aria-label="Job title"
              onChange={(event) => update({ title: event.target.value })}
            />
          </div>
          <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}>
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
              onChange={(event) => update({ customer: event.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="jd-city">
              City
            </label>
            <input
              id="jd-city"
              className="field-input"
              value={draft.city}
              onChange={(event) => update({ city: event.target.value })}
            />
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
              <label className="field-label" htmlFor="jd-quote">
                Quote
              </label>
              <input
                id="jd-quote"
                className="field-input num"
                value={draft.quote}
                onChange={(event) => update({ quote: event.target.value })}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="jd-total">
                Total
              </label>
              <input
                id="jd-total"
                className="field-input num"
                value={draft.total}
                onChange={(event) => update({ total: event.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label">Change order</span>
            <span className={`change ${draft.changeTone}`}>{draft.change}</span>
          </div>

          <div className="field">
            <span className="field-label">Last updated</span>
            <span className="field-static">{draft.updated}</span>
          </div>
        </div>

        <footer className="drawer-foot">
          {confirming ? (
            <div className="confirm-bar" role="alert">
              <span className="confirm-text">Delete this job?</span>
              <div className="confirm-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-danger btn-sm" type="button" onClick={handleDelete}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-danger" type="button" onClick={handleDelete}>
              <Icon icon={Trash2} className="ico ico-sm" />
              Delete job
            </button>
          )}

          <div className="drawer-foot-right">
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="button" onClick={handleSave}>
              Save changes
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
export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>(JOBS);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const selected = jobs.find((job) => job.id === selectedId) ?? null;

  const handleSave = (next: Job) => {
    setJobs((prev) => prev.map((job) => (job.id === next.id ? next : job)));
    setSelectedId(null);
  };

  const handleDelete = (id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
    setSelectedId(null);
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

        <div className="content">
          <section className="panel panel-jobs">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <h2>All jobs</h2>
                <span className="count">{jobs.length}</span>
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
                <tbody>
                  {visibleJobs.map((job) => (
                    <tr key={job.id} data-status={job.status}>
                      <td className="cell-job">
                        <button
                          type="button"
                          className="job-open"
                          onClick={() => setSelectedId(job.id)}
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
                            onClick={() => setSelectedId(job.id)}
                          >
                            <Icon icon={Pencil} className="ico ico-sm" />
                          </button>
                          <button
                            type="button"
                            className="icon-btn-mini danger"
                            aria-label={`Delete ${job.title}`}
                            onClick={() => {
                              setSelectedId(job.id);
                            }}
                          >
                            <Icon icon={Trash2} className="ico ico-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {visibleJobs.length === 0 ? (
                    <tr className="empty-row">
                      <td colSpan={8}>No jobs match this filter.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="panel-foot">
              <span className="foot-note">
                Showing {visibleJobs.length} of {jobs.length} jobs
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
                  <span className="summary-val num">{jobs.length}</span>
                </li>
                {SUMMARY_ORDER.map((status) => (
                  <li className="summary-row" key={status}>
                    <span className={`summary-dot ${status}`} aria-hidden="true" />
                    <span className="summary-name">{STATUS_LABEL[status]}</span>
                    <span className="summary-val num">{counts[status]}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>

      {selected ? (
        <JobDrawer
          key={selected.id}
          job={selected}
          onClose={() => setSelectedId(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : null}
    </AppShell>
  );
}
