# ScopeLock — Build Plan

This file lists exactly what will be included in the first version. It is written in plain language so anyone can read it and understand what the product does and what we build.

---

## Demand basis

This tool comes from `content/research/next-micro-tool-demand-research-2026-11-07.md`:

- a 118-upvote post about customers adding jobs after agreeing a quote,
- a separate owner struggling to keep track of estimates,
- search demand for quoting, estimating, and job management software,
- reviews showing that small operators reject complex, per-seat field-service suites.

The pain is verified. The exact product still needs the validation step at the end of this file.

---

## What the application does

ScopeLock helps a tradesperson or service business protect the agreed quote.

They create a quote and send it to the customer for approval. During the job, if the customer asks for extra work, the plumber logs it as a change order. The customer approves or rejects that change on their own device. The final invoice automatically includes only the original quote plus the approved changes.

The core promise: **no unpaid extras, no surprise charges, and a clear record of what was agreed.**

---

## Who it is for

Solo tradespeople and micro service businesses (1–10 people) in the UK and Europe:

- plumbers,
- electricians,
- builders,
- installers,
- repair and maintenance businesses.

They quote fixed-price jobs, work on site, and regularly get asked for small extras after the price is agreed.

---

## The one job

Keep the agreed scope and every approved change in one place, so the final invoice is never a surprise.

It is not a CRM, a scheduler, an accounting system, or a payment platform.

---

## Core v1 features

### 1. Job and quote creation

- Create a job with customer name, contact details, address, job title, and date.
- Choose the currency (GBP or EUR).
- Add line items: description, quantity, unit price, and line total.
- Add notes and a quote validity date.
- Save the quote as a draft.
- No templates in v1.
- Use a mobile-friendly form; use desktop for longer quotes.

### 2. Quote approval link

- Generate a secure, expiring link for the quote.
- Send it by copying the link, email, or SMS. Email and SMS providers are optional.
- The customer opens the link in a browser without creating an account.
- The customer sees the quote, line items, total, notes, and validity date.
- The customer approves or rejects the quote.
- On approval, record the customer name, timestamp, method, and device.
- On rejection, allow an optional reason.
- Quote statuses: draft, sent, approved, rejected, expired.

### 3. Job dashboard

- Show a list of jobs: draft, awaiting approval, approved, in progress, completed.
- Search and filter by customer or status.
- Open a job to see the quote, changes, current total, and audit log.

### 4. Change order creation

- From a job, tap "Add change".
- Fields: description, amount, optional photo, optional note, and who requested it.
- Default status: pending approval.
- Show the original quote total, approved changes, pending changes, and new total.
- The plumber can edit or void a change before approval.
- After approval, a change cannot be edited. Void it and issue a new one, so the audit trail stays intact.

### 5. Change approval

- Generate a secure link for each change order.
- Remote approval: send the link by copy, email, or SMS.
- In-person approval: show a QR code on the plumber's screen. The customer scans it and approves on their own phone.
- The customer sees the change description, amount, photo, and updated total.
- The customer approves or rejects the change.
- Record the customer name, timestamp, method, and device.
- Change statuses: pending, approved, rejected, cancelled.
- Pending and rejected changes are never included in the final invoice.
- Customers without a smartphone are out of scope for v1. Use a signed paper change order and mark it as "manual" in the audit log.

### 6. Totals and status engine

- Show the original quote total.
- Show the approved changes total.
- Show the pending changes total.
- Show the rejected changes total.
- Show the current job total: original quote plus approved changes.
- Show the final invoice total: original quote plus approved changes only.
- Keep the breakdown visible on every job.

### 7. Final invoice

- Generate a PDF invoice with:
  - business details,
  - customer details,
  - original quote line items,
  - approved changes as separate line items with their approval dates,
  - total,
  - payment terms and notes.
- Export or download the PDF.
- No payment processing.
- Invoice status: draft or final.
- Include approval references so the customer can see what was approved.

### 8. Audit log

- Record every quote and change event: created, sent, viewed, approved, rejected, voided.
- Include who acted, when, the method (link or QR), and the document version.
- Make the log immutable.
- Export the audit log as PDF or CSV.
- This is the proof layer that prevents "I thought it was included".

### 9. Settings

- Business name, logo, contact details, currency, tax label (VAT or GST), and payment terms.
- No multi-user support in v1.
- No accounting integration.

### 10. Responsive web application

- Mobile-first for on-site use.
- Desktop-friendly for quote creation and admin.
- No native app.
- A PWA layer can be added later for home-screen and camera access.

---

## What is intentionally not included

To keep v1 simple and open-source:

- No AI quote drafting.
- No photo-to-line-item extraction.
- No CRM.
- No scheduling or calendar.
- No payments or deposits.
- No accounting or tax filing.
- No multi-user or roles.
- No inventory.
- No quote templates.
- No native mobile app.
- No subscription.
- No bank integration.
- No automatic reminders.
- No negotiation chat.
- No line-by-line partial approval. The customer approves or rejects the whole change.

---

## Open-source core vs paid custom

| Layer | What is included |
|---|---|
| **Open-source core** | Job and quote creation, public quote approval link, change order creation, link/QR approval, statuses, totals, final invoice PDF, audit log, self-hosting |
| **Paid custom** | AI quote drafting, photo-to-line-item, SMS/WhatsApp provider setup, custom branding, quote templates, multi-user roles, accounting export, hosting and setup, custom workflows |

This boundary keeps the open-source tool focused. Every future request should be classified as core, paid custom, or rejected.

---

## Technical shape

- Next.js responsive web application.
- Simple API routes.
- SQLite for self-hosting; Postgres for a hosted version.
- Signed, expiring tokens for public quote and change links.
- PDF generation for quotes, invoices, and audit logs.
- Email and SMS are optional. Copying a link must work without a provider.
- Self-hostable with Docker.
- No native app.
- No AI in v1.

---

## Build order (flow, not timeline)

1. **Job and quote creation** — create a job, add line items, save a draft.
2. **Public quote link** — send, view, approve, or reject.
3. **Change order creation** — add a change with description, amount, and optional photo.
4. **Public change approval** — link and QR approval, with statuses.
5. **Totals and status engine** — quote, approved, pending, rejected, and final totals.
6. **Final invoice PDF** — original quote plus approved changes only.
7. **Audit log** — immutable record of every event.
8. **Responsive mobile UI** — make the on-site flow fast.
9. **Self-host packaging** — Docker, setup docs, environment variables.
10. **Paid add-ons later** — AI drafting, SMS/WhatsApp, templates, multi-user.

---

## How the features work together

The plumber creates a job and a quote. The customer approves the quote through a link. The job starts.

When the customer asks for extra work, the plumber adds a change order. If the customer is present, they scan a QR code and approve on their own phone. If not, they receive a link. The change is approved or rejected. The job total updates immediately.

At the end, the plumber generates the final invoice. It contains the original quote plus approved changes only. The audit log stores every approval.

That is the core loop: **quote → approve → change → approve → invoice → audit.**

---

## Success criteria

- A plumber can add a change and get customer approval in under 60 seconds.
- The customer never needs an account.
- The final invoice never includes pending or rejected changes.
- Every approval has a timestamped record.
- The app works well on a phone and on a desktop.
- A self-hoster can run it with one Docker command.

---

## Validation before the full build

The category demand is validated. The exact product still needs a small validation step:

1. Put up a one-page landing site with the promise and a waitlist.
2. Talk to 10 UK or German tradespeople who quote fixed-price jobs.
3. Run a concierge test with 5 real jobs: use a simple form, a link, and a PDF to simulate the flow.
4. Build the full tool only if they use it on a second job.

---

## Summary

ScopeLock is a simple, open-source quote and change-order approval tool for trades and micro service businesses. It protects the plumber from unpaid extras and the customer from surprise charges. It does one job: lock the quote, approve changes, and invoice only what was approved.
