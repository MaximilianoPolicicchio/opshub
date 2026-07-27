# ADR 0008 — Operating costs: manual entry first, mailbox ingestion later

**Status:** accepted · **Date:** 2026-07-26

## Context

The product tracks what work earns — budgets, burn, billable hours — and nothing
about what it costs. Answering "what does Maxus Dental cost me per month" means
recording vendors, recurring subscriptions and real charges.

Most of that information arrives by email: invoices and receipts from Vercel,
Supabase, hosting, domains. The obvious idea is to read the mailbox. That framing
is what this record pushes back on.

## Decision

**Build the model and manual entry first. Do not connect a mailbox.**

Specifically:

1. No Gmail OAuth, no IMAP, no reading a personal inbox — not in this phase and
   not as a hidden capability.
2. Expenses are entered by hand. The monthly close works entirely without any
   integration.
3. Ingestion is *designed* — endpoint shape, payload, HMAC scheme, idempotency
   key, `COST_INGESTION_SECRET` — and documented in `costs.md`, but not built.
4. When it is built, it consumes a **dedicated billing address**, not a personal
   mailbox, and stores only the handful of fields the cost model needs. No email
   bodies, no attachments, no headers.
5. Until the endpoint exists and is verified, no document in this repository may
   describe email ingestion as working, and there is no "connected" UI for it.

## Alternatives considered

**Gmail OAuth and parse the inbox.** The convenient answer, and the reason it is
rejected is scope of access rather than effort. OAuth for a personal mailbox
grants far more than "read invoices from Vercel": it grants the whole inbox,
including password resets and private correspondence, to a hobby project with no
security review. That is a disproportionate blast radius for saving some typing,
and it makes the repository unpublishable without an awkward asterisk.

**Ingestion endpoint first, UI later.** Rejected for a design reason as much as a
security one. Building the importer first means shaping the schema around a
message format instead of the business question, and it puts an endpoint that
creates money records into the repo before the model that validates them exists.

**Store the raw email alongside each expense.** Tempting for auditability.
Rejected: it turns a cost table into a mail archive, drags attachments and
personal content into the database, and none of it is needed to know that 20 USD
went to Vercel on the 4th.

## Consequences

- The monthly close requires manual entry. For roughly a dozen recurring
  subscriptions across four projects that is a few minutes a month, and the
  review step is work that would exist anyway.
- The schema carries `source` and `externalReference` from day one, so adding
  ingestion later is additive rather than a migration of existing rows.
- Imported expenses will land as `PENDING_REVIEW`, so no external system can
  move a monthly total without a human. That is a permanent rule, not a
  transitional one.
- The idempotency key is a database unique constraint on
  `(workspaceId, source, externalReference)`, not an application check, so a
  retrying importer cannot double-count.
- `COST_INGESTION_SECRET` is documented but **not** added to `.env.example`
  until the endpoint exists — an env var for a route that does not exist is a
  claim that it does.

## Revisit when

Manual entry becomes the bottleneck — realistically, more vendors than fit on one
screen, or a month skipped because entering it was tedious. At that point build
the ingestion endpoint exactly as specified in `costs.md`, starting with a
billing address, and still never a personal mailbox.
