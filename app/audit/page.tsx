"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CircleCheck,
  CircleX,
  Eye,
  FilePlus2,
  RefreshCw,
  ScrollText,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import AppShell, { Icon } from "../app-shell";
import { money } from "../../lib/quotes-types";
import {
  AUDIT_FILTERS,
  SOURCE_LABEL,
  type AuditEntry,
  type AuditSource,
  type AuditSummary,
  type AuditTone,
} from "../../lib/audit-shared";
import { dayHeading, groupByDay, timeOfDay } from "../../lib/audit-view";
import { useNow } from "../quotes/use-now";
import { getAuditFeed, getAuditJobOptions } from "./actions";
import "./audit.css";

/* ------------------------------------------------------------------
   Audit log.

   A timeline rather than a table: these events are a story about one job,
   and reading a story in columns is harder than reading it in order. Each
   day is a bucket, each event a row with time on the left and the document
   on the right.

   The colour of the marker carries the meaning — green for agreed, rust for
   declined, blue for money moving — so the shape of a job's history is
   legible before any text is read.
   ------------------------------------------------------------------ */

const TONE_ICON: Record<AuditTone, typeof CircleCheck> = {
  agree: CircleCheck,
  decline: CircleX,
  moved: ArrowUpRight,
  sent: Send,
  seen: Eye,
  created: FilePlus2,
  other: Sparkles,
};

/** Quiet events are dimmed so decisions stand out. */
const QUIET: AuditTone[] = ["seen", "other"];

const SKELETON_ROWS = 5;

function toneIcon(entry: AuditEntry) {
  if (entry.tone === "moved" && (entry.amountCents ?? 0) < 0) return ArrowDownRight;
  return TONE_ICON[entry.tone];
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [jobs, setJobs] = useState<{ jobReference: string; jobTitle: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<AuditTone | "all">("all");
  const [source, setSource] = useState<AuditSource | "all">("all");
  const [jobReference, setJobReference] = useState<string>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  // `useNow()` is null during prerender, so "Today"/"Yesterday" resolve on the
  // client. Calling `new Date()` here instead would fail the static build.
  const todayKey = useMemo(
    () => (now === null ? "" : new Date(now).toISOString().slice(0, 10)),
    [now],
  );

  /**
   * Filters run server-side so the client never holds more than one page of
   * history. A short debounce keeps typing responsive without firing a query
   * per keystroke.
   */
  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      try {
        const feed = await getAuditFeed({
          tone: filter,
          source,
          query,
          jobReference: jobReference === "all" ? undefined : jobReference,
        });
        if (signal?.cancelled) return;
        setEntries(feed.entries);
        setSummary(feed.summary);
        setTruncated(feed.truncated);
        setLoadError(null);
      } catch {
        if (signal?.cancelled) return;
        setLoadError("Could not load the audit log. Check your connection and try again.");
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [filter, source, query, jobReference],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    const id = window.setTimeout(() => void load(signal), query ? 220 : 0);
    return () => {
      signal.cancelled = true;
      window.clearTimeout(id);
    };
  }, [load, query]);

  useEffect(() => {
    void getAuditJobOptions()
      .then(setJobs)
      .catch(() => setJobs([]));
  }, []);

  const days = useMemo(() => groupByDay(entries), [entries]);
  const activeFilters =
    filter !== "all" || source !== "all" || jobReference !== "all" || query.trim() !== "";

  const clearFilters = () => {
    setFilter("all");
    setSource("all");
    setJobReference("all");
    setQuery("");
  };

  return (
    <AppShell
      activeNav="audit"
      breadcrumb={<span className="crumb-current">Audit log</span>}
      query={query}
      onQueryChange={setQuery}
      searchRef={searchRef}
    >
      <div className="page audit-page">
        <section className="page-head">
          <div className="page-head-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Everything, in order
            </p>
            <h1>Audit log</h1>
            <p className="lede">
              Every quote, change and invoice decision in one timeline. If a customer
              ever asks what they agreed to, and when — this is the answer.
            </p>
          </div>
        </section>

        {/* ---------- Summary ---------- */}
        <section className="au-summary" aria-label="Activity summary" aria-busy={loading}>
          <div className="au-summary-item">
            <span className="au-summary-value">
              {loading ? <span className="sk sk-count" aria-hidden="true" /> : (summary?.total ?? 0)}
            </span>
            <span className="au-summary-label">events recorded</span>
          </div>
          <div className="au-summary-rule" aria-hidden="true" />
          <div className="au-summary-item">
            <span className="au-summary-value is-agree">
              {loading ? <span className="sk sk-count" aria-hidden="true" /> : (summary?.agreed ?? 0)}
            </span>
            <span className="au-summary-label">agreements</span>
          </div>
          <div className="au-summary-rule" aria-hidden="true" />
          <div className="au-summary-item">
            <span className="au-summary-value is-decline">
              {loading ? <span className="sk sk-count" aria-hidden="true" /> : (summary?.declined ?? 0)}
            </span>
            <span className="au-summary-label">declined</span>
          </div>
          <div className="au-summary-rule" aria-hidden="true" />
          <div className="au-summary-item">
            <span className="au-summary-value is-moved">
              {loading ? <span className="sk sk-count" aria-hidden="true" /> : (summary?.moved ?? 0)}
            </span>
            <span className="au-summary-label">price changes</span>
          </div>
          {!loading && summary && summary.movedCents !== 0 ? (
            <>
              <div className="au-summary-rule" aria-hidden="true" />
              <div className="au-summary-item">
                <span
                  className={`au-summary-value ${summary.movedCents < 0 ? "is-decline" : "is-agree"}`}
                >
                  {summary.movedCents < 0 ? "−" : "+"}
                  {money(Math.abs(summary.movedCents), "GBP")}
                </span>
                <span className="au-summary-label">net moved</span>
              </div>
            </>
          ) : null}
          {!loading && summary ? (
            <>
              <div className="au-summary-rule" aria-hidden="true" />
              <div className="au-summary-item">
                <span className="au-summary-value">{summary.jobs}</span>
                <span className="au-summary-label">
                  {summary.jobs === 1 ? "job" : "jobs"} in view
                </span>
              </div>
            </>
          ) : null}
        </section>

        {/* ---------- Controls ---------- */}
        <section className="au-controls">
          <div className="segmented" role="group" aria-label="Filter by outcome">
            {AUDIT_FILTERS.map((option) => (
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

          <div className="segmented" role="group" aria-label="Filter by document">
            {(["all", "quote", "change", "invoice"] as const).map((option) => (
              <button
                key={option}
                className={`seg${source === option ? " is-active" : ""}`}
                type="button"
                aria-pressed={source === option}
                onClick={() => setSource(option)}
              >
                {option === "all" ? "All documents" : SOURCE_LABEL[option]}
              </button>
            ))}
          </div>

          {jobs.length > 1 ? (
            <label className="au-job-filter">
              <span className="sr-only">Filter by job</span>
              <select
                className="au-select"
                value={jobReference}
                onChange={(event) => setJobReference(event.target.value)}
              >
                <option value="all">All jobs</option>
                {jobs.map((job) => (
                  <option key={job.jobReference} value={job.jobReference}>
                    {job.jobReference}
                    {job.jobTitle ? ` — ${job.jobTitle}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        {loadError ? (
          <div className="inline-error" role="alert">
            <Icon icon={AlertTriangle} className="ico ico-sm" />
            <span>{loadError}</span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void load()}>
              <Icon icon={RefreshCw} className="ico ico-sm" />
              Retry
            </button>
          </div>
        ) : null}

        {/* ---------- Timeline ---------- */}
        {loading ? (
          <div className="au-timeline" aria-busy="true">
            <div className="au-list">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div className="au-item is-skeleton" key={i} aria-hidden="true">
                  <span className="sk sk-text" style={{ width: 34, marginLeft: 12 }} />
                  <span className="sk sk-icon" />
                  <div>
                    <span className="sk sk-title" />
                    <span className="sk sk-sub" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : days.length === 0 ? (
          <section className="panel">
            <div className="q-empty">
              <span className="q-empty-mark">
                <Icon icon={ScrollText} className="ico" />
              </span>
              <h3>{entries.length === 0 && !activeFilters ? "No activity yet" : "Nothing matches"}</h3>
              <p>
                {activeFilters
                  ? "No recorded events match these filters. Try widening the selection."
                  : "Once you send a quote or raise a change order, every decision shows up here."}
              </p>
              {activeFilters ? (
                <button className="btn btn-ghost btn-sm" type="button" onClick={clearFilters}>
                  <Icon icon={X} className="ico ico-sm" />
                  Clear filters
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <div className="au-timeline">
            {days.map((day) => (
              <section className="au-day" key={day.key}>
                <h2 className="au-day-heading">
                  {dayHeading(day.items[0].at, todayKey)}
                  <span className="au-day-count">{day.items.length}</span>
                </h2>

                <ol className="au-list">
                  {day.items.map((entry) => {
                    const quiet = QUIET.includes(entry.tone);
                    return (
                      <li
                        className={`au-item au-tone-${entry.tone}${quiet ? " is-quiet" : ""}`}
                        key={entry.id}
                      >
                        <div className="au-time">
                          <time dateTime={entry.at}>{timeOfDay(entry.at)}</time>
                        </div>

                        <div className="au-marker" aria-hidden="true">
                          <span className="au-dot">
                            <Icon icon={toneIcon(entry)} className="ico ico-xs" />
                          </span>
                        </div>

                        <div className="au-body">
                          <div className="au-body-head">
                            <span className="au-label">{entry.label}</span>
                            {typeof entry.amountCents === "number" && entry.amountCents !== 0 ? (
                              <span
                                className={`au-amount ${entry.amountCents < 0 ? "is-neg" : "is-pos"}`}
                              >
                                {entry.amountCents < 0 ? "−" : "+"}
                                {money(Math.abs(entry.amountCents), entry.currency)}
                              </span>
                            ) : null}
                          </div>

                          {entry.detail ? <p className="au-detail">{entry.detail}</p> : null}

                          <div className="au-meta">
                            <span className="au-doc">{entry.documentReference}</span>
                            <span className="ch-dot" />
                            <span className="au-job">{entry.jobReference}</span>
                            <span className="ch-dot" />
                            <span>{entry.customer}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}

        {truncated && !loading ? (
          <p className="au-footnote is-warn">
            Showing the {entries.length} most recent events. Narrow the filters to see further
            back.
          </p>
        ) : (
          <p className="au-footnote">
            Entries are recorded automatically and cannot be edited.
            {entries.length > 0 ? ` Showing ${entries.length} events.` : ""}
          </p>
        )}
      </div>
    </AppShell>
  );
}
