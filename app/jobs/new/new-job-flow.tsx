"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CircleCheck,
  FileText,
  History,
  Lock,
  PenLine,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

type Currency = "GBP" | "EUR";
type Step = 1 | 2 | 3;
type SaveState = "idle" | "saving" | "saved";

type LineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type Draft = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  jobTitle: string;
  jobDate: string;
  currency: Currency;
  items: LineItem[];
  notes: string;
  validUntil: string;
};

type Errors = Record<string, string>;

/* ------------------------------------------------------------------
   Constants + helpers
   ------------------------------------------------------------------ */

const DRAFT_KEY = "scopelock:new-job:v1";

const STEPS: { label: string; desc: string }[] = [
  { label: "Customer", desc: "Who and where" },
  { label: "Quote", desc: "Work and price" },
  { label: "Review", desc: "Check and save" },
];

const STEP_COPY: Record<Step, { title: ReactNode; lede: string }> = {
  1: {
    title: (
      <>
        Who&apos;s the <em>job</em> for?
      </>
    ),
    lede: "Start with the customer and the basics. You can build the quote next.",
  },
  2: {
    title: (
      <>
        What&apos;s <em>included</em>?
      </>
    ),
    lede: "Add the work you have agreed to do. This becomes the baseline for the whole job.",
  },
  3: {
    title: (
      <>
        Does it all <em>add up</em>?
      </>
    ),
    lede: "Check the details and the customer view, then save the quote as a draft.",
  },
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function newItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `item-${Date.now()}`;
}

function createItem(id = newItemId()): LineItem {
  return { id, description: "", quantity: "1", unitPrice: "" };
}

function makeInitialDraft(): Draft {
  const today = new Date();
  return {
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postcode: "",
    jobTitle: "",
    jobDate: toDateInput(today),
    currency: "GBP",
    items: [createItem()],
    notes: "",
    validUntil: toDateInput(addDays(today, 30)),
  };
}

const EMPTY_DRAFT: Draft = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
  jobTitle: "",
  jobDate: "",
  currency: "GBP",
  items: [createItem("1")],
  notes: "",
  validUntil: "",
};

function currencyLocale(currency: Currency) {
  return currency === "GBP" ? "en-GB" : "en-IE";
}

function formatMoney(cents: number, currency: Currency) {
  return new Intl.NumberFormat(currencyLocale(currency), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function toCents(value: string) {
  return Math.round((Number(value) || 0) * 100);
}

function lineTotalCents(item: LineItem) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  return Math.round(quantity * unitPrice * 100);
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

/* ------------------------------------------------------------------
   Small building blocks
   ------------------------------------------------------------------ */

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  min,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email" | "decimal" | "numeric";
  min?: string;
  className?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`nj-field${className ? ` ${className}` : ""}`}>
      <label className="nj-label" htmlFor={id}>
        {label}
        {optional ? <span className="nj-optional">Optional</span> : null}
      </label>
      <input
        id={id}
        name={id}
        className={`nj-input${error ? " is-invalid" : ""}`}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        min={min}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p className="nj-error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="nj-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SectionHead({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <div className="nj-section-head">
      <span className="nj-section-icon">
        <Icon className="ico" aria-hidden="true" />
      </span>
      <div>
        <h2 className="nj-section-title">{title}</h2>
        <p className="nj-section-hint">{hint}</p>
      </div>
    </div>
  );
}

function ReviewRow({
  icon: Icon,
  label,
  value,
  sub,
  onEdit,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  onEdit: () => void;
}) {
  return (
    <div className="nj-review-row">
      <span className="nj-review-icon">
        <Icon className="ico ico-sm" aria-hidden="true" />
      </span>
      <div className="nj-review-copy">
        <span className="nj-review-label">{label}</span>
        <span className="nj-review-value">{value}</span>
        {sub ? <span className="nj-review-sub">{sub}</span> : null}
      </div>
      <button type="button" className="nj-edit" onClick={onEdit}>
        <PenLine className="ico ico-xs" aria-hidden="true" />
        Edit
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------
   Flow
   ------------------------------------------------------------------ */

export default function NewJobFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Errors>({});
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStepRender = useRef(true);
  const dirtyRef = useRef(false);

  const currency = draft.currency;
  const currencySymbol = currency === "GBP" ? "£" : "€";
  const previewItems = draft.items.filter(
    (item) => item.description.trim() || item.unitPrice.trim(),
  );
  const totalCents = draft.items.reduce((sum, item) => sum + lineTotalCents(item), 0);
  const itemCount = draft.items.filter((item) => item.description.trim()).length;
  const firstName = draft.customerName.trim().split(/\s+/)[0] || "the customer";
  const addressText = [
    draft.addressLine1,
    draft.addressLine2,
    draft.city,
    draft.postcode,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  /* Restore a local draft once, then let autosave take over. */
  useEffect(() => {
    const fallback = makeInitialDraft();
    let nextDraft = fallback;
    let didRestore = false;

    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
        const items = rawItems.length
          ? rawItems.map((rawItem, index) => {
              const item =
                rawItem && typeof rawItem === "object"
                  ? (rawItem as Record<string, unknown>)
                  : {};
              return {
                id: readString(item.id, `restored-${index}`),
                description: readString(item.description),
                quantity: readString(item.quantity, "1"),
                unitPrice: readString(item.unitPrice),
              };
            })
          : fallback.items;

        nextDraft = {
          customerName: readString(parsed.customerName),
          customerEmail: readString(parsed.customerEmail),
          customerPhone: readString(parsed.customerPhone),
          addressLine1: readString(parsed.addressLine1),
          addressLine2: readString(parsed.addressLine2),
          city: readString(parsed.city),
          postcode: readString(parsed.postcode),
          jobTitle: readString(parsed.jobTitle),
          jobDate: readString(parsed.jobDate) || fallback.jobDate,
          currency: parsed.currency === "EUR" ? "EUR" : "GBP",
          items,
          notes: readString(parsed.notes),
          validUntil: readString(parsed.validUntil) || fallback.validUntil,
        };
        didRestore = true;
      }
    } catch {
      /* Ignore unreadable local drafts. */
    }

    // One-time restore from localStorage. This only runs on mount and cannot be
    // done during render without a hydration mismatch, so the effect is correct.
    /* eslint-disable react-hooks/set-state-in-effect */
    setDraft(nextDraft);
    setRestored(didRestore);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /* Debounced local autosave. */
  useEffect(() => {
    if (!ready || saved || !dirtyRef.current) return;

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 550);

    return () => window.clearTimeout(timer);
  }, [draft, ready, saved]);

  /* Move focus and scroll to the top when the step changes. */
  useEffect(() => {
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (!saved) return;
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [saved]);

  /* ----------------------------------------------------------------
     Validation + mutation helpers
     ---------------------------------------------------------------- */

  function clearErrors(...keys: string[]) {
    setErrors((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const key of keys) {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }

  function focusError(next: Errors) {
    const firstKey = Object.keys(next)[0];
    if (!firstKey) return;
    const targetId =
      firstKey === "items" ? `item-${draft.items[0]?.id ?? "1"}-description` : firstKey;
    window.requestAnimationFrame(() => {
      const element = document.getElementById(targetId);
      if (element instanceof HTMLElement) element.focus();
    });
  }

  function validateStep1() {
    const next: Errors = {};
    if (!draft.customerName.trim()) next.customerName = "Enter the customer's name.";
    if (!draft.jobTitle.trim()) next.jobTitle = "Give this job a short title.";
    if (!draft.jobDate) next.jobDate = "Choose the job date.";
    const email = draft.customerEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.customerEmail = "Enter a valid email address.";
    }
    return next;
  }

  function validateStep2() {
    const next: Errors = {};
    let hasPricedItem = false;

    const touchedRows = draft.items.filter(
      (item) => item.description.trim() || item.unitPrice.trim(),
    );
    if (touchedRows.length === 0) {
      next.items = "Add at least one line item.";
    }

    draft.items.forEach((item) => {
      const hasDescription = Boolean(item.description.trim());
      const hasPrice = Boolean(item.unitPrice.trim());
      const hasAny = hasDescription || hasPrice;
      if (!hasAny) return;

      if (!hasDescription) next[`item-${item.id}-description`] = "Add a description.";
      if (!(Number(item.quantity) > 0)) {
        next[`item-${item.id}-quantity`] = "Qty must be more than 0.";
      }
      if (!hasPrice || !(Number(item.unitPrice) > 0)) {
        next[`item-${item.id}-price`] = "Add a price.";
      }
      if (hasDescription && Number(item.unitPrice) > 0 && Number(item.quantity) > 0) {
        hasPricedItem = true;
      }
    });

    if (!hasPricedItem && !next.items && Object.keys(next).length === 0) {
      next.items = "Add at least one line item with a description and a price.";
    }

    if (!draft.validUntil) {
      next.validUntil = "Choose how long the quote is valid.";
    } else if (draft.jobDate && draft.validUntil < draft.jobDate) {
      next.validUntil = "The quote must stay valid until the job date.";
    }

    return next;
  }

  function commit(updater: (current: Draft) => Draft) {
    dirtyRef.current = true;
    setSaveState("saving");
    setDraft(updater);
  }

  function updateField<K extends keyof Draft>(key: K, value: Draft[K]) {
    clearErrors(key as string);
    commit((current) => ({ ...current, [key]: value }));
  }

  function updateItem(id: string, patch: Partial<LineItem>) {
    clearErrors(
      "items",
      `item-${id}-description`,
      `item-${id}-quantity`,
      `item-${id}-price`,
    );
    commit((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function addItem() {
    const id = newItemId();
    commit((current) => ({ ...current, items: [...current.items, createItem(id)] }));
    window.setTimeout(() => {
      document.getElementById(`item-${id}-description`)?.focus();
    }, 0);
  }

  function removeItem(id: string) {
    clearErrors("items", `item-${id}-description`, `item-${id}-quantity`, `item-${id}-price`);
    commit((current) => {
      if (current.items.length === 1) {
        return { ...current, items: [createItem(current.items[0].id)] };
      }
      return { ...current, items: current.items.filter((item) => item.id !== id) };
    });
  }

  function handleContinue() {
    const next = step === 1 ? validateStep1() : step === 2 ? validateStep2() : {};
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusError(next);
      return;
    }
    if (step < 3) setStep((step + 1) as Step);
  }

  function handleSave() {
    const step1Errors = validateStep1();
    const step2Errors = validateStep2();
    const allErrors = { ...step1Errors, ...step2Errors };

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      const nextStep: Step = Object.keys(step1Errors).length > 0 ? 1 : 2;
      setStep(nextStep);
      window.setTimeout(() => focusError(allErrors), 80);
      return;
    }

    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* Autosave already reported the failure. */
    }
    setSaveState("saved");
    setSaved(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 3) {
      handleSave();
      return;
    }
    handleContinue();
  }

  function handleBack() {
    if (step > 1) {
      setErrors({});
      setStep((step - 1) as Step);
      return;
    }
    router.push("/");
  }

  function handleExit() {
    if (dirtyRef.current) {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* Ignore storage failures on exit. */
      }
    }
    router.push("/");
  }

  function startFresh() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Ignore storage failures. */
    }
    dirtyRef.current = false;
    setDraft(makeInitialDraft());
    setErrors({});
    setStep(1);
    setRestored(false);
    setSaved(false);
    setSaveState("idle");
    firstStepRender.current = true;
    scrollRef.current?.scrollTo({ top: 0 });
  }

  /* ----------------------------------------------------------------
     Render
     ---------------------------------------------------------------- */

  return (
    <div className="nj-frame">
      <header className="nj-topbar">
        <div className="nj-topbar-left">
          <button
            type="button"
            className="nj-topbar-back"
            onClick={handleExit}
            aria-label="Save and go back"
          >
            <ArrowLeft className="ico" aria-hidden="true" />
          </button>

          <Link href="/" className="nj-brand">
            <span className="brand-mark nj-brand-mark">
              <Lock className="ico" aria-hidden="true" />
            </span>
            <span className="nj-brand-copy">
              <span className="nj-brand-name">ScopeLock</span>
              <span className="nj-brand-sub">Trade workspace</span>
            </span>
          </Link>

          <span className="nj-topbar-divider" aria-hidden="true" />

          <div className="nj-topbar-title">
            <span>New job</span>
            <span className="nj-draft-chip">Draft</span>
          </div>
        </div>

        <div className="nj-topbar-right">
          <span className="nj-savestate" aria-live="polite">
            {saveState === "saved" ? (
              <>
                <Check className="ico ico-xs" aria-hidden="true" />
                Saved
              </>
            ) : saveState === "saving" ? (
              "Saving…"
            ) : null}
          </span>
          {!saved ? (
            <button type="button" className="btn btn-ghost nj-exit" onClick={handleExit}>
              Save &amp; exit
            </button>
          ) : null}
        </div>
      </header>

      <div className="nj-scroll" ref={scrollRef}>
        <div className="nj-page">
          {saved ? (
            <div className="nj-success">
              <span className="nj-success-icon">
                <CircleCheck className="ico" aria-hidden="true" />
              </span>

              <p className="nj-eyebrow">
                <span className="nj-eyebrow-dot" aria-hidden="true" />
                Draft saved
              </p>
              <h1 className="nj-title">Your quote is ready.</h1>
              <p className="nj-lede">
                It is stored as a draft on this device. Sending the approval link is the
                next step — nothing has gone to {firstName} yet.
              </p>

              <div className="nj-success-card">
                <div className="nj-success-row">
                  <span>Customer</span>
                  <strong>{draft.customerName || "—"}</strong>
                </div>
                <div className="nj-success-row">
                  <span>Job</span>
                  <strong>{draft.jobTitle || "—"}</strong>
                </div>
                <div className="nj-success-row">
                  <span>Date</span>
                  <strong className="num">{formatDate(draft.jobDate)}</strong>
                </div>
                <div className="nj-success-row">
                  <span>Line items</span>
                  <strong className="num">{itemCount}</strong>
                </div>
                <div className="nj-success-row nj-success-total">
                  <span>Quote total</span>
                  <strong className="num">{formatMoney(totalCents, currency)}</strong>
                </div>
                <div className="nj-success-row">
                  <span>Valid until</span>
                  <strong className="num">{formatDate(draft.validUntil)}</strong>
                </div>
              </div>

              <div className="nj-success-actions">
                <Link href="/" className="btn btn-primary">
                  Back to overview
                  <ArrowRight className="ico ico-sm" aria-hidden="true" />
                </Link>
                <button type="button" className="btn btn-ghost" onClick={startFresh}>
                  <Plus className="ico ico-sm" aria-hidden="true" />
                  Create another job
                </button>
              </div>

              <p className="nj-success-note">
                <Lock className="ico ico-xs" aria-hidden="true" />
                Draft only — nothing sent yet.
              </p>
            </div>
          ) : (
            <>
              <header className="nj-head">
                <p className="nj-eyebrow">
                  <span className="nj-eyebrow-dot" aria-hidden="true" />
                  New job · Step {step} of 3
                </p>
                <h1 className="nj-title" ref={headingRef} tabIndex={-1}>
                  {STEP_COPY[step].title}
                </h1>
                <p className="nj-lede">{STEP_COPY[step].lede}</p>
              </header>

              <div className="nj-mobile-progress" aria-hidden="true">
                {STEPS.map((item, index) => (
                  <span
                    key={item.label}
                    className={`nj-mobile-seg${index + 1 <= step ? " is-on" : ""}`}
                  />
                ))}
              </div>

              <div className="nj-stepper" aria-label="Job setup steps">
                {STEPS.map((item, index) => {
                  const stepNumber = (index + 1) as Step;
                  const state = stepNumber < step ? "done" : stepNumber === step ? "current" : "todo";
                  return (
                    <Fragment key={item.label}>
                      {index > 0 ? (
                        <span
                          className={`nj-step-line${step > index ? " is-done" : ""}`}
                          aria-hidden="true"
                        />
                      ) : null}
                      <div
                        className={`nj-step${state === "current" ? " is-current" : ""}${
                          state === "done" ? " is-done" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className="nj-step-btn"
                          onClick={() => {
                            if (stepNumber < step) {
                              setErrors({});
                              setStep(stepNumber);
                            }
                          }}
                          disabled={stepNumber >= step}
                          aria-current={state === "current" ? "step" : undefined}
                        >
                          <span className="nj-step-dot">
                            {state === "done" ? (
                              <Check className="ico ico-xs" aria-hidden="true" />
                            ) : (
                              `0${stepNumber}`
                            )}
                          </span>
                          <span className="nj-step-copy">
                            <span className="nj-step-label">{item.label}</span>
                            <span className="nj-step-desc">{item.desc}</span>
                          </span>
                        </button>
                      </div>
                    </Fragment>
                  );
                })}
              </div>

              {restored ? (
                <div className="nj-restored" role="status">
                  <span className="nj-restored-copy">
                    <History className="ico ico-sm" aria-hidden="true" />
                    Draft restored from this device.
                  </span>
                  <button type="button" className="nj-restored-btn" onClick={startFresh}>
                    Start fresh
                  </button>
                </div>
              ) : null}

              <div className="nj-grid">
                <div className="nj-main">
                  <div className="nj-card">
                    <form id="new-job-form" className="nj-form" onSubmit={handleSubmit} noValidate>
                      {step === 1 ? (
                        <>
                          <section className="nj-section">
                            <SectionHead
                              icon={User}
                              title="Customer"
                              hint="Who the quote is for. Only the name is required."
                            />
                            <div className="nj-section-body">
                              <div className="nj-row nj-row-2">
                                <TextField
                                  id="customerName"
                                  label="Customer name"
                                  value={draft.customerName}
                                  onChange={(value) => updateField("customerName", value)}
                                  error={errors.customerName}
                                  placeholder="Sarah Miller"
                                  autoComplete="name"
                                />
                                <TextField
                                  id="customerPhone"
                                  label="Phone"
                                  value={draft.customerPhone}
                                  onChange={(value) => updateField("customerPhone", value)}
                                  optional
                                  type="tel"
                                  inputMode="tel"
                                  placeholder="07700 900123"
                                  autoComplete="tel"
                                />
                              </div>
                              <TextField
                                id="customerEmail"
                                label="Email"
                                value={draft.customerEmail}
                                onChange={(value) => updateField("customerEmail", value)}
                                error={errors.customerEmail}
                                optional
                                type="email"
                                inputMode="email"
                                placeholder="sarah@example.com"
                                autoComplete="email"
                                hint="Used to send the approval link later."
                              />
                            </div>
                          </section>

                          <section className="nj-section">
                            <SectionHead
                              icon={Briefcase}
                              title="Job site"
                              hint="Where the work happens. The customer link shows this too."
                            />
                            <div className="nj-section-body">
                              <TextField
                                id="addressLine1"
                                label="Address line 1"
                                value={draft.addressLine1}
                                onChange={(value) => updateField("addressLine1", value)}
                                optional
                                placeholder="14 Oak Street"
                                autoComplete="address-line1"
                              />
                              <TextField
                                id="addressLine2"
                                label="Address line 2"
                                value={draft.addressLine2}
                                onChange={(value) => updateField("addressLine2", value)}
                                optional
                                placeholder="Flat 3"
                                autoComplete="address-line2"
                              />
                              <div className="nj-row nj-row-2">
                                <TextField
                                  id="city"
                                  label="Town or city"
                                  value={draft.city}
                                  onChange={(value) => updateField("city", value)}
                                  optional
                                  placeholder="Bristol"
                                  autoComplete="address-level2"
                                />
                                <TextField
                                  id="postcode"
                                  label="Postcode"
                                  value={draft.postcode}
                                  onChange={(value) => updateField("postcode", value)}
                                  optional
                                  placeholder="BS1 4DJ"
                                  autoComplete="postal-code"
                                />
                              </div>
                            </div>
                          </section>

                          <section className="nj-section">
                            <SectionHead
                              icon={FileText}
                              title="The job"
                              hint="A short title is all the customer sees at the top of the quote."
                            />
                            <div className="nj-section-body">
                              <TextField
                                id="jobTitle"
                                label="Job title"
                                value={draft.jobTitle}
                                onChange={(value) => updateField("jobTitle", value)}
                                error={errors.jobTitle}
                                placeholder="Bathroom renovation"
                              />
                              <div className="nj-row nj-row-2">
                                <TextField
                                  id="jobDate"
                                  label="Job date"
                                  value={draft.jobDate}
                                  onChange={(value) => updateField("jobDate", value)}
                                  error={errors.jobDate}
                                  type="date"
                                />
                                <div className="nj-field">
                                  <span className="nj-label">Currency</span>
                                  <div className="nj-seg" role="group" aria-label="Quote currency">
                                    {(["GBP", "EUR"] as Currency[]).map((option) => (
                                      <button
                                        key={option}
                                        type="button"
                                        className={`nj-seg-btn${currency === option ? " is-on" : ""}`}
                                        aria-pressed={currency === option}
                                        onClick={() => updateField("currency", option)}
                                      >
                                        {option === "GBP" ? "£ GBP" : "€ EUR"}
                                      </button>
                                    ))}
                                  </div>
                                  <p className="nj-hint">Used for every price on this job.</p>
                                </div>
                              </div>
                            </div>
                          </section>
                        </>
                      ) : null}
                      {step === 2 ? (
                        <>
                          <section className="nj-section">
                            <SectionHead
                              icon={ReceiptText}
                              title="Line items"
                              hint="One line per piece of work. Description, quantity, then price."
                            />
                            <div className="nj-section-body">
                              <div className="nj-items">
                                {draft.items.map((item, index) => (
                                  <div className="nj-item" key={item.id}>
                                    <div className="nj-item-top">
                                      <span className="nj-item-num">
                                        {String(index + 1).padStart(2, "0")}
                                      </span>
                                      <span className="nj-item-total num">
                                        {formatMoney(lineTotalCents(item), currency)}
                                      </span>
                                      <button
                                        type="button"
                                        className="nj-item-remove"
                                        onClick={() => removeItem(item.id)}
                                        aria-label={`Remove line ${index + 1}`}
                                        disabled={draft.items.length === 1}
                                      >
                                        <Trash2 className="ico ico-sm" aria-hidden="true" />
                                      </button>
                                    </div>

                                    <div className="nj-item-grid">
                                      <TextField
                                        id={`item-${item.id}-description`}
                                        label="Description"
                                        value={item.description}
                                        onChange={(value) =>
                                          updateItem(item.id, { description: value })
                                        }
                                        error={errors[`item-${item.id}-description`]}
                                        placeholder="Remove old bathroom suite"
                                        className="nj-item-desc"
                                      />

                                      <TextField
                                        id={`item-${item.id}-quantity`}
                                        label="Qty"
                                        value={item.quantity}
                                        onChange={(value) =>
                                          updateItem(item.id, { quantity: value })
                                        }
                                        error={errors[`item-${item.id}-quantity`]}
                                        inputMode="decimal"
                                      />
                                      <TextField
                                        id={`item-${item.id}-price`}
                                        label={`Unit price (${currencySymbol})`}
                                        value={item.unitPrice}
                                        onChange={(value) =>
                                          updateItem(item.id, { unitPrice: value })
                                        }
                                        error={errors[`item-${item.id}-price`]}
                                        inputMode="decimal"
                                        placeholder="0.00"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {errors.items ? (
                                <p className="nj-error nj-items-error">{errors.items}</p>
                              ) : null}

                              <button type="button" className="nj-add" onClick={addItem}>
                                <Plus className="ico ico-sm" aria-hidden="true" />
                                Add line item
                              </button>

                              <div className="nj-subtotal">
                                <span>Quote total</span>
                                <strong className="num">
                                  {formatMoney(totalCents, currency)}
                                </strong>
                              </div>
                            </div>
                          </section>

                          <section className="nj-section">
                            <SectionHead
                              icon={FileText}
                              title="Notes and validity"
                              hint="Optional notes, plus how long this price holds."
                            />
                            <div className="nj-section-body">
                              <div className="nj-field">
                                <label className="nj-label" htmlFor="notes">
                                  Notes for the customer
                                  <span className="nj-optional">Optional</span>
                                </label>
                                <textarea
                                  id="notes"
                                  name="notes"
                                  className="nj-textarea"
                                  rows={4}
                                  value={draft.notes}
                                  onChange={(event) => updateField("notes", event.target.value)}
                                  placeholder="What's included, access details, anything they should know."
                                />
                                <p className="nj-hint">
                                  Appears on the quote, under the line items.
                                </p>
                              </div>

                              <TextField
                                id="validUntil"
                                label="Quote valid until"
                                value={draft.validUntil}
                                onChange={(value) => updateField("validUntil", value)}
                                error={errors.validUntil}
                                type="date"
                                hint="After this date the customer link stops accepting approvals."
                              />

                              <div className="nj-callout">
                                <Lock className="ico ico-sm" aria-hidden="true" />
                                <p>
                                  Once the customer approves, this quote locks as the
                                  baseline. Extra work later goes in as a change order, not
                                  a new quote.
                                </p>
                              </div>
                            </div>
                          </section>
                        </>
                      ) : null}
                      {step === 3 ? (
                        <>
                          <section className="nj-section">
                            <SectionHead
                              icon={CircleCheck}
                              title="Check the details"
                              hint="Edit anything that doesn't look right."
                            />
                            <div className="nj-section-body">
                              <div className="nj-review">
                                <ReviewRow
                                  icon={User}
                                  label="Customer"
                                  value={draft.customerName || "Not set"}
                                  sub={
                                    [draft.customerEmail, draft.customerPhone]
                                      .map((part) => part.trim())
                                      .filter(Boolean)
                                      .join(" · ") || "No contact details"
                                  }
                                  onEdit={() => {
                                    setErrors({});
                                    setStep(1);
                                  }}
                                />
                                <ReviewRow
                                  icon={Briefcase}
                                  label="Job"
                                  value={draft.jobTitle || "Not set"}
                                  sub={
                                    [formatDate(draft.jobDate), addressText]
                                      .filter(Boolean)
                                      .join(" · ") || "No date or address"
                                  }
                                  onEdit={() => {
                                    setErrors({});
                                    setStep(1);
                                  }}
                                />
                                <ReviewRow
                                  icon={ReceiptText}
                                  label="Quote"
                                  value={`${itemCount} line item${itemCount === 1 ? "" : "s"} · ${formatMoney(
                                    totalCents,
                                    currency,
                                  )}`}
                                  sub={`Valid until ${formatDate(draft.validUntil)}`}
                                  onEdit={() => {
                                    setErrors({});
                                    setStep(2);
                                  }}
                                />
                              </div>
                            </div>
                          </section>

                          <section className="nj-section">
                            <SectionHead
                              icon={FileText}
                              title="Customer view"
                              hint="What they will see when the approval link opens."
                            />
                            <div className="nj-section-body">
                              <div className="nj-paper-wrap">
                                <article className="nj-paper" aria-label="Quote preview">
                                  <header className="nj-paper-head">
                                    <div className="nj-paper-brand">
                                      <span className="nj-paper-mark" aria-hidden="true">
                                        H
                                      </span>
                                      <div>
                                        <strong>Harris &amp; Co.</strong>
                                        <span>Plumbing &amp; Heating</span>
                                      </div>
                                    </div>
                                    <span className="nj-paper-draft">Draft</span>
                                  </header>

                                  <div className="nj-paper-meta">
                                    <div className="nj-paper-to">
                                      <span>Prepared for</span>
                                      <strong>{draft.customerName || "—"}</strong>
                                      {addressText ? <em>{addressText}</em> : null}
                                    </div>
                                    <div className="nj-paper-dates">
                                      <div>
                                        <span>Date</span>
                                        <strong className="num">
                                          {formatDate(draft.jobDate)}
                                        </strong>
                                      </div>
                                      <div>
                                        <span>Valid until</span>
                                        <strong className="num">
                                          {formatDate(draft.validUntil)}
                                        </strong>
                                      </div>
                                    </div>
                                  </div>

                                  <h3 className="nj-paper-title">
                                    {draft.jobTitle || "Untitled job"}
                                  </h3>

                                  <table className="nj-paper-table">
                                    <thead>
                                      <tr>
                                        <th scope="col">Work</th>
                                        <th scope="col">Qty</th>
                                        <th scope="col">Price</th>
                                        <th scope="col">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {previewItems.length > 0 ? (
                                        previewItems.map((item) => (
                                          <tr key={item.id}>
                                            <td>{item.description || "—"}</td>
                                            <td className="num">{item.quantity || "1"}</td>
                                            <td className="num">
                                              {formatMoney(
                                                toCents(item.unitPrice),
                                                currency,
                                              )}
                                            </td>
                                            <td className="num">
                                              {formatMoney(
                                                lineTotalCents(item),
                                                currency,
                                              )}
                                            </td>
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td colSpan={4} className="nj-paper-empty">
                                            No line items yet.
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>

                                  <div className="nj-paper-total">
                                    <span>Total</span>
                                    <strong className="num">
                                      {formatMoney(totalCents, currency)}
                                    </strong>
                                  </div>

                                  {draft.notes.trim() ? (
                                    <p className="nj-paper-notes">{draft.notes}</p>
                                  ) : null}

                                  <footer className="nj-paper-foot">
                                    <ShieldCheck className="ico ico-sm" aria-hidden="true" />
                                    Approve or reject online. No account needed.
                                  </footer>
                                </article>
                              </div>

                              <p className="nj-paper-caption">
                                Business details come from settings later. This is a
                                preview only.
                              </p>

                              <div className="nj-callout nj-callout-save">
                                <Lock className="ico ico-sm" aria-hidden="true" />
                                <p>
                                  Saving keeps this as a draft on this device. Nothing is
                                  sent to {firstName} until you send the link.
                                </p>
                              </div>
                            </div>
                          </section>
                        </>
                      ) : null}
                    </form>

                    <div className="nj-actions">
                      <button type="button" className="btn btn-ghost" onClick={handleBack}>
                        <ArrowLeft className="ico ico-sm" aria-hidden="true" />
                        {step === 1 ? "Cancel" : "Back"}
                      </button>

                      {step === 3 ? (
                        <button type="button" className="btn btn-primary" onClick={handleSave}>
                          Save draft
                          <Check className="ico ico-sm" aria-hidden="true" />
                        </button>
                      ) : (
                        <button type="submit" form="new-job-form" className="btn btn-primary">
                          Continue
                          <ArrowRight className="ico ico-sm" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <aside className="nj-rail" aria-label="Quote summary">
                  <div className="nj-rail-inner">
                    <section className="scope nj-scope" aria-label="Live quote summary">
                      <div className="scope-head">
                        <span className="scope-icon">
                          <Lock className="ico" aria-hidden="true" />
                        </span>
                        <span className="scope-kicker">Live quote</span>
                        <span className="scope-badge">
                          <span className="scope-badge-dot" />
                          Draft
                        </span>
                      </div>

                      <p className="scope-label">
                        {draft.customerName ? `For ${firstName}` : "Quote total"}
                      </p>
                      <p className="scope-value num">{formatMoney(totalCents, currency)}</p>
                      <p className="scope-sub">
                        {itemCount} line item{itemCount === 1 ? "" : "s"} · valid until{" "}
                        {formatDate(draft.validUntil)}
                      </p>

                      <div className="scope-bar" aria-hidden="true">
                        <span className="bar bar-approved" />
                      </div>

                      <div className="scope-legend">
                        <div className="legend-row">
                          <span className="key key-lime" aria-hidden="true" />
                          <span className="legend-name">Original quote</span>
                          <span className="legend-val num">
                            {formatMoney(totalCents, currency)}
                          </span>
                        </div>
                        <div className="legend-row">
                          <span className="key key-amber" aria-hidden="true" />
                          <span className="legend-name">Approved changes</span>
                          <span className="legend-val num">
                            {formatMoney(0, currency)}
                          </span>
                        </div>
                      </div>

                      <p className="nj-scope-note">
                        Only approved work is ever invoiced.
                      </p>
                    </section>

                    <section className="nj-next" aria-label="What happens next">
                      <h2>What happens next</h2>
                      <ol>
                        <li>
                          <span className="nj-next-num">01</span>
                          <div>
                            <strong>You send the link</strong>
                            <p>
                              {firstName} opens it on their phone. No account, no app.
                            </p>
                          </div>
                        </li>
                        <li>
                          <span className="nj-next-num">02</span>
                          <div>
                            <strong>The quote locks</strong>
                            <p>The approved total becomes the baseline for the job.</p>
                          </div>
                        </li>
                        <li>
                          <span className="nj-next-num">03</span>
                          <div>
                            <strong>Extra work is a change</strong>
                            <p>
                              Each change gets its own link, and only approved ones are
                              invoiced.
                            </p>
                          </div>
                        </li>
                      </ol>
                    </section>
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </div>

      {!saved ? (
        <div className="nj-mobilebar">
          <div className="nj-mobilebar-copy">
            <span>{step === 1 ? "Step 1 of 3" : "Quote total"}</span>
            <strong className={step === 1 ? "" : "num"}>
              {step === 1 ? "Customer" : formatMoney(totalCents, currency)}
            </strong>
          </div>
          <div className="nj-mobilebar-actions">
            <button
              type="button"
              className="nj-mobileback"
              onClick={handleBack}
              aria-label={step === 1 ? "Cancel" : "Back"}
            >
              <ArrowLeft className="ico" aria-hidden="true" />
            </button>
            {step === 3 ? (
              <button type="button" className="btn btn-primary" onClick={handleSave}>
                Save draft
              </button>
            ) : (
              <button type="submit" form="new-job-form" className="btn btn-primary">
                Continue
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
