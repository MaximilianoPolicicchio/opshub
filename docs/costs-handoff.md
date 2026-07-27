# Operating Costs — handoff

**Status: IN PROGRESS** — plan written, nothing implemented yet.

Keep this file current. It is the contract with whoever picks the work up next,
including a future me. Update it after every phase, not at the end.

---

## Objective

Answer, every month, for Hernan Shop, Maxus Dental, Maxus Market and Consultorio
PYM Automations:

1. What does each project cost?
2. Which costs were expected, and which actually landed?
3. Which subscriptions went up in price?
4. Which expenses need a human to look at them?
5. What is the monthly close, in total and per project?

This is the cost side of the money picture. `ProjectBudget` already answers
"what am I earning and how much of the budget have I burned"; nothing today
answers "what am I paying".

---

## Hard constraint: no mailbox access

**Gmail is not being connected, and no OAuth is being implemented.** The MVP is
manual entry only.

The design keeps a door open for later: a dedicated billing address, or n8n
watching one, POSTing selected invoices to a signed ingestion endpoint. Until
that endpoint exists and is verified, **no documentation in this repository may
claim email ingestion works**, and there will be no "Gmail connected" UI.

When ingestion is built, it must not store full email bodies or attachments.
Only the fields the cost model actually needs, plus an external id for
idempotency.

---

## Decisions taken, and why

**Manual-first, not n8n-first.** The value is in the model and the monthly
close; ingestion is a convenience on top. Building ingestion first would mean
designing a schema around a message format instead of around the business
question. It also keeps a webhook that accepts money records out of the repo
until the model that validates them exists. Recorded as ADR 0008.

**`Vendor` is a first-class row, not a string on the expense.** "Which
subscriptions went up" needs a stable identity to compare prices over time. A
free-text vendor field makes `Vercel`, `vercel` and `Vercel Inc.` three
different suppliers. Hence `normalizedName`, unique per workspace, for
deduplication and for matching future imports.

**Expected cost lives on `Subscription`, actual cost on `Expense`.** That
separation is the entire expected-vs-actual feature. A subscription is the
standing intent; an expense is what was really charged.

**`projectId` is optional on both.** Shared infrastructure genuinely is not
attributable to one project. Forcing a project would produce fake precision.
Unassigned costs are reported as their own bucket rather than silently dropped
or spread around.

**No percentage split across projects in v1.** Cost allocation is a real
feature with real rules (by revenue? by hours? fixed?) and inventing one now
would be guessing. Documented as future work in `costs.md`.

**Money is `Decimal`, following the existing convention.** `@db.Decimal(12, 2)`
for amounts, `decimal.js` in services, never a JS float. Currency is stored per
row and **never converted** — totals are grouped by currency, exactly as
Financial Overview already does.

**Status is a review queue, not a payment ledger.** `PENDING_REVIEW` /
`CONFIRMED` / `REJECTED` / `PAID`. Imported expenses land in `PENDING_REVIEW` so
nothing external can silently alter the monthly total.

---

## Plan

Phases are small and independently committable. Tick them off here as they land.

- [x] **A. Handoff + design docs** — this file, `costs.md`, ADR 0008.
- [ ] **B. Schema + migration + contracts** — Vendor, Subscription, Expense,
      enums, Zod schemas.
- [ ] **C. API** — vendors, subscriptions, expenses CRUD; review queue;
      monthly summary. Tenant-scoped, Zod-validated.
- [ ] **D. Web** — Costs page: expenses list with filters, review queue,
      monthly summary, vendor and subscription management.
- [ ] **E. Tests** — pure summary logic unit tests, API e2e including
      cross-tenant isolation.
- [ ] **F. Ingestion (design only unless time allows)** — contract, payload,
      HMAC scheme, `COST_INGESTION_SECRET`, exact steps to resume.

---

## Files created or modified

Phase A:
- `docs/costs-handoff.md` (this file)
- `docs/costs.md` — model, monthly rules, ingestion design
- `docs/adr/0008-costs-manual-first.md`
- `docs/adr/README.md`, `docs/README.md` — index entries

## Migrations applied

_None yet._

## Commands run, and their real results

| Command | Result |
| --- | --- |
| `git status` / `git log -1` | clean tree at `ece4096` |
| schema + module inspection | patterns confirmed, see below |

Findings from inspection, so the next agent does not repeat it:

- Tenant rows carry a denormalised `workspaceId`; money is
  `Decimal @db.Decimal(12, 2)`; ids are `cuid()`.
- Controllers take `@WorkspaceId()` from the guard — **never** from the body.
- Reads are `findFirst({ id, workspaceId })`; every `update`/`delete` carries
  `workspaceId` in its own `where`. `tenant-scoping.arch.spec.ts` fails the
  build otherwise, and it lists tenant models explicitly — **new cost models
  must be added to that list**.
- Modules follow `x.module.ts` / `x.controller.ts` / `x.service.ts`, with pure
  rules in `*.logic.ts` so they unit-test without a database.
- Frontend: one hook file per domain using TanStack Query + `queryKeys`, pages
  under `app/(app)/`, nav entries in `components/layout/Sidebar.tsx`.
- **Response shapes differ per endpoint** — some list endpoints return
  `{ rows, total, page, pageSize }`, others a bare array. Match the hook to the
  endpoint or the UI silently renders nothing.

## Errors and blockers

_None yet._

---

## Environment variables

| Variable | Needed for | Status |
| --- | --- | --- |
| `COST_INGESTION_SECRET` | HMAC signature on the future ingestion endpoint | **not yet used** — do not add to `.env.example` until the endpoint exists |

No new variables are required for the manual MVP.

---

## Next 3 exact steps

1. Add `Vendor`, `Subscription`, `Expense` and their enums to
   `apps/api/prisma/schema.prisma`; generate the migration with
   `pnpm --filter @opshub/api exec prisma migrate dev --name add_operating_costs`;
   add the three models to the tenant list in `tenant-scoping.arch.spec.ts`.
2. Add cost schemas to `packages/contracts/src/schemas.ts` and enums to
   `enums.ts`, then `pnpm --filter @opshub/contracts build` before typechecking
   anything that imports them.
3. Build the `costs` NestJS module (vendors, subscriptions, expenses, summary),
   following the `budgets` module layout with the summary maths in a
   `*.logic.ts`.

---

## How to test this manually

_Will be filled in once phase C lands. Do not leave this section aspirational._
