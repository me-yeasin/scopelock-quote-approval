"use client";

import { Plus, Trash2 } from "lucide-react";
import { Icon } from "../../app-shell";
import { money, type Quote } from "../../../lib/quotes-types";

/* ------------------------------------------------------------------
   Inline quote editor.

   Mirrors the pricing step of the new-job flow so the two feel like one
   product. Quantities and prices are edited as decimal strings (what a
   person types) and converted to integer minor units exactly once, on
   save, which keeps the arithmetic exact.
   ------------------------------------------------------------------ */

export type EditLine = {
  /** Stable React key; not persisted. */
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

export type EditDraft = {
  title: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  currency: "GBP" | "EUR";
  notes: string;
  validUntil: string;
  lines: EditLine[];
};

export type EditErrors = Record<string, string>;

let lineSeq = 0;
export function newEditLine(description = "", quantity = "1", unitPrice = ""): EditLine {
  lineSeq += 1;
  return { key: `ln-${Date.now()}-${lineSeq}`, description, quantity, unitPrice };
}

export function toEditDraft(quote: Quote): EditDraft {
  return {
    title: quote.title,
    customerName: quote.customer,
    customerEmail: quote.customerEmail,
    customerPhone: quote.customerPhone,
    city: quote.city,
    currency: quote.currency,
    notes: quote.notes,
    validUntil: quote.validUntil.slice(0, 10),
    lines: quote.lines.map((line) =>
      newEditLine(
        line.description,
        String(line.quantity),
        // Show a plain decimal, never a float artefact.
        (line.unitPriceCents / 100).toFixed(2),
      ),
    ),
  };
}

/** Parse a typed amount into integer minor units. */
function toCents(value: string) {
  return Math.round((Number(value) || 0) * 100);
}

function lineCents(line: EditLine) {
  return Math.round((Number(line.quantity) || 0) * toCents(line.unitPrice));
}

export function draftSubtotal(draft: EditDraft) {
  return draft.lines.reduce((sum, line) => sum + lineCents(line), 0);
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  hint,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  inputMode?: "text" | "email" | "tel" | "decimal";
}) {
  return (
    <div className="qe-field">
      <label className="qe-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`qe-input${error ? " is-invalid" : ""}`}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p className="qe-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="qe-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export default function QuoteEditForm({
  draft,
  errors,
  disabled,
  onChange,
}: {
  draft: EditDraft;
  errors: EditErrors;
  disabled: boolean;
  onChange: (next: EditDraft) => void;
}) {
  const set = (patch: Partial<EditDraft>) => onChange({ ...draft, ...patch });

  const setLine = (key: string, patch: Partial<EditLine>) =>
    set({
      lines: draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    });

  const addLine = () => set({ lines: [...draft.lines, newEditLine()] });

  const removeLine = (key: string) =>
    set({ lines: draft.lines.filter((line) => line.key !== key) });

  const subtotal = draftSubtotal(draft);

  return (
    <>
      {/* ---------- Header fields ---------- */}
      <section className="q-section">
        <h3 className="q-section-title">Quote details</h3>

        <Field
          id="qe-title"
          label="Title"
          value={draft.title}
          onChange={(title) => set({ title })}
          error={errors.title}
          placeholder="Bathroom renovation"
        />

        <div className="qe-grid">
          <Field
            id="qe-name"
            label="Customer"
            value={draft.customerName}
            onChange={(customerName) => set({ customerName })}
            error={errors.customerName}
            placeholder="M. Harris"
          />
          <Field
            id="qe-city"
            label="City"
            value={draft.city}
            onChange={(city) => set({ city })}
            error={errors.city}
            placeholder="London"
          />
        </div>

        <div className="qe-grid">
          <Field
            id="qe-email"
            label="Email"
            type="email"
            inputMode="email"
            value={draft.customerEmail}
            onChange={(customerEmail) => set({ customerEmail })}
            error={errors.customerEmail}
            placeholder="name@example.com"
          />
          <Field
            id="qe-phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            value={draft.customerPhone}
            onChange={(customerPhone) => set({ customerPhone })}
            error={errors.customerPhone}
            placeholder="+44 …"
          />
        </div>

        <div className="qe-grid">
          <div className="qe-field">
            <label className="qe-label" htmlFor="qe-currency">
              Currency
            </label>
            <select
              id="qe-currency"
              className="qe-input"
              value={draft.currency}
              disabled={disabled}
              onChange={(event) => set({ currency: event.target.value as "GBP" | "EUR" })}
            >
              <option value="GBP">GBP £</option>
              <option value="EUR">EUR €</option>
            </select>
          </div>
          <Field
            id="qe-valid"
            label="Valid until"
            type="date"
            value={draft.validUntil}
            onChange={(validUntil) => set({ validUntil })}
            error={errors.validUntil}
          />
        </div>
      </section>

      {/* ---------- Line items ---------- */}
      <section className="q-section">
        <h3 className="q-section-title">
          Line items
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
            {draft.lines.length} {draft.lines.length === 1 ? "item" : "items"}
          </span>
        </h3>

        <div className="qe-lines">
          {draft.lines.map((line, index) => {
            const amount = lineCents(line);
            return (
              <div className="qe-line" key={line.key}>
                <div className="qe-line-top">
                  <input
                    className={`qe-input${errors[`line.${index}.description`] ? " is-invalid" : ""}`}
                    value={line.description}
                    placeholder="What is this for?"
                    aria-label={`Line ${index + 1} description`}
                    disabled={disabled}
                    onChange={(event) => setLine(line.key, { description: event.target.value })}
                  />
                  <button
                    className="qe-line-remove"
                    type="button"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={disabled || draft.lines.length === 1}
                    onClick={() => removeLine(line.key)}
                  >
                    <Icon icon={Trash2} className="ico ico-sm" />
                  </button>
                </div>

                <div className="qe-line-bottom">
                  <div className="qe-line-num">
                    <label className="qe-mini" htmlFor={`qty-${line.key}`}>
                      Qty
                    </label>
                    <input
                      id={`qty-${line.key}`}
                      className={`qe-input${errors[`line.${index}.quantity`] ? " is-invalid" : ""}`}
                      value={line.quantity}
                      inputMode="decimal"
                      disabled={disabled}
                      onChange={(event) => setLine(line.key, { quantity: event.target.value })}
                    />
                  </div>
                  <div className="qe-line-num">
                    <label className="qe-mini" htmlFor={`price-${line.key}`}>
                      Unit price
                    </label>
                    <input
                      id={`price-${line.key}`}
                      className={`qe-input${errors[`line.${index}.unitPrice`] ? " is-invalid" : ""}`}
                      value={line.unitPrice}
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={disabled}
                      onChange={(event) => setLine(line.key, { unitPrice: event.target.value })}
                    />
                  </div>
                  <div className="qe-line-total">
                    <span className="qe-mini">Line total</span>
                    <span className="q-num">{money(amount, draft.currency)}</span>
                  </div>
                </div>

                {errors[`line.${index}.description`] ||
                errors[`line.${index}.quantity`] ||
                errors[`line.${index}.unitPrice`] ? (
                  <p className="qe-error" role="alert">
                    {errors[`line.${index}.description`] ??
                      errors[`line.${index}.quantity`] ??
                      errors[`line.${index}.unitPrice`]}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <button className="qe-add" type="button" disabled={disabled} onClick={addLine}>
          <Icon icon={Plus} className="ico ico-sm" />
          Add line item
        </button>

        {errors.lines ? (
          <p className="qe-error" role="alert">
            {errors.lines}
          </p>
        ) : null}

        <div className="qe-subtotal">
          <span>Quote subtotal</span>
          <span className="q-num">{money(subtotal, draft.currency)}</span>
        </div>
      </section>

      {/* ---------- Notes ---------- */}
      <section className="q-section">
        <h3 className="q-section-title">Notes &amp; assumptions</h3>
        <textarea
          className="qe-input qe-textarea"
          rows={4}
          value={draft.notes}
          placeholder="Anything the customer should know — exclusions, access, assumptions."
          disabled={disabled}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </section>
    </>
  );
}
