# Operating Costs — handoff

**Status: IMPLEMENTED (manual entry)** — schema, contracts, API, web UI and
tests are done and verified against a live database and in a browser.

Email/n8n ingestion is **designed only**. No endpoint exists. Nothing in the
product claims otherwise.

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
- [x] **B. Schema + migration + contracts** — Vendor, Subscription, Expense,
      enums, Zod schemas.
- [x] **C. API** — vendors, subscriptions, expenses CRUD; review queue;
      monthly summary. Tenant-scoped, Zod-validated.
- [x] **D. Web** — Costs page: expenses list with filters, review queue,
      monthly summary, vendor and subscription management.
- [x] **E. Tests** — pure summary logic unit tests, API e2e including
      cross-tenant isolation.
- [x] **F. Ingestion — design only, deliberately.** Contract, payload, HMAC
      scheme and resume steps are in `costs.md`. The Zod schema
      (`ingestExpenseSchema`) exists in `packages/contracts` so the shape is
      fixed and reviewable, but **no route consumes it**.

---

## Files created or modified

Phase G (demo data):
- `apps/api/prisma/seed.ts` — 5 vendors, 5 subscriptions, 5 expenses in the
  demo workspace. Idempotent: vendors matched on `normalizedName`,
  subscriptions on name, expenses on a `seed-*` `externalReference`. Verified
  by running the seed twice and confirming the counts did not move.
- `apps/api/src/modules/costs/cost-summary.logic.ts` — price increases are now
  deduplicated per subscription.

Phase D + E:
- `apps/web/app/(app)/costs/page.tsx` — summary, review queue, price increases,
  per-project table, expense list with filters, subscriptions, and dialogs for
  vendor / subscription / expense
- `apps/web/hooks/useCosts.ts`, `apps/web/lib/types.ts`, `lib/query-keys.ts`
- `apps/web/components/layout/Sidebar.tsx` — Costs nav entry
- `apps/api/test/costs.e2e-spec.ts` — 11 tests, mostly cross-tenant isolation

Phase B + C:
- `apps/api/prisma/schema.prisma` — Vendor, Subscription, Expense + 4 enums,
  back-references on Workspace and Project
- `apps/api/prisma/migrations/20260727172026_add_operating_costs/`
- `apps/api/src/prisma/tenant-scoping.arch.spec.ts` — registered the 3 new
  tenant models so unscoped writes fail the build
- `apps/api/src/modules/costs/` — `costs.module.ts`, `costs.controller.ts`,
  `costs.service.ts`, `cost-summary.logic.ts`, `cost-summary.logic.spec.ts`
- `apps/api/src/app.module.ts` — registered CostsModule
- `packages/contracts/src/enums.ts`, `schemas.ts` — cost enums and Zod schemas

Phase A:
- `docs/costs-handoff.md` (this file)
- `docs/costs.md` — model, monthly rules, ingestion design
- `docs/adr/0008-costs-manual-first.md`
- `docs/adr/README.md`, `docs/README.md` — index entries

## Migrations applied

`20260727172026_add_operating_costs` — created via `prisma migrate dev`, applied
to the local database. Adds `Vendor`, `Subscription`, `Expense` and the enums
`CostFrequency`, `CostCategory`, `ExpenseStatus`, `ExpenseSource`.

Two constraints in it are load-bearing:
- `Vendor @@unique([workspaceId, normalizedName])` — stops the same supplier
  fragmenting across capitalisations.
- `Expense @@unique([workspaceId, source, externalReference])` — the idempotency
  key for future imports. Nulls are ignored by Postgres, so manual rows are
  unconstrained.

## Commands run, and their real results

| Command | Result |
| --- | --- |
| `git status` / `git log -1` | clean tree at `ece4096` |
| schema + module inspection | patterns confirmed, see below |
| `prisma validate` | valid |
| `prisma migrate dev --name add_operating_costs` | applied, client regenerated |
| `pnpm --filter @opshub/contracts build` | pass |
| `pnpm --filter @opshub/api typecheck` | pass |
| `pnpm --filter @opshub/api lint` | pass |
| `pnpm --filter @opshub/api test` | pass (76 tests, incl. 21 new cost-summary) |
| `pnpm --filter @opshub/api build` | pass |
| manual API run against live Postgres | verified, see below |
| `pnpm --filter @opshub/web typecheck` | pass |
| `pnpm --filter @opshub/web lint` | pass |
| `pnpm --filter @opshub/web build` | pass, `/costs` 9.36 kB |
| `pnpm -r typecheck` / `pnpm -r lint` | pass |
| `pnpm --filter @opshub/api test` | **76 passed**, 8 suites |
| `pnpm --filter @opshub/api test:e2e` | **49 passed**, 8 suites |
| browser check of `/costs` | verified, see below |
| `db:seed` run twice | idempotent — 5 vendors / 5 subs / 5 expenses both times |
| `pnpm --filter @opshub/api test` (after seed work) | **77 passed** |

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

## Verified by hand against a running API

Logged in as the demo user and exercised the real endpoints:

- `POST /costs/vendors` with `"  Vercel  "` stored `name: "Vercel"`,
  `normalizedName: "vercel"`.
- Creating `"VERCEL"` afterwards returned `VENDOR_ALREADY_EXISTS` with the
  existing id — the deduplication works on a real round-trip, not just in tests.
- `POST /costs/subscriptions` — Vercel Pro, 20.00 USD monthly, on Maxus Dental.
- `POST /costs/expenses` for 25.00 stored `status: CONFIRMED`, `source: MANUAL`
  (both server-set; the client cannot choose them).
- `GET /costs/summary?month=2026-07` returned
  `expected 20.00 / actual 25.00 / difference 5.00`, the same figures per
  project, and a price increase of `20.00 -> 25.00 (25.00%)`.

## Verified in a browser

Signed in as the demo user against a production build:

- `/costs` renders the monthly summary (expected 20.00 / actual 25.00 /
  difference 5.00), the price increase (`Vercel Pro 20.00 -> 25.00, 25.00%`),
  the per-project table and the expense list.
- Logged a 12.50 expense with no project through the dialog. The total moved to
  37.50, an **Unassigned** row appeared at 12.50, and the expense list updated —
  so the write path and query invalidation both work.

## Errors and blockers

**One real bug, found by the e2e suite and fixed.** `GET /costs/summary?month=`
called `monthSchema.parse()` directly. `ZodValidationPipe` only covers the body,
so a malformed month threw a raw `ZodError` and Nest returned **500** instead of
400. Now parsed with `safeParse` and mapped to the standard 400 envelope; the
test that caught it is kept.

**A UI bug the seeded data exposed.** With two expenses linked to the same
subscription, the price-increases table rendered the same subscription twice
with identical figures — which reads as a rendering fault rather than as two
charges. `summariseMonth` now emits one row per subscription, keeping the
largest increase. That is also the more honest answer to "which subscriptions
went up", which is a question about subscriptions, not about charges.

Otherwise none. One thing worth knowing: Prisma serialises `Decimal` to JSON as a
bare number (`25`), while the summary endpoint returns pre-formatted strings
(`"25.00"`). The UI should format amounts from list endpoints rather than
printing them raw.

---

## Environment variables

| Variable | Needed for | Status |
| --- | --- | --- |
| `COST_INGESTION_SECRET` | HMAC signature on the future ingestion endpoint | **not yet used** — do not add to `.env.example` until the endpoint exists |

No new variables are required for the manual MVP.

---

## Next 3 exact steps

The manual MVP is complete, and the seed now populates it. In priority order:

1. **Editing from the UI.** The API supports `PATCH` on subscriptions and
   expenses, and the hooks (`useUpdateSubscription`, `useUpdateExpense`,
   `useDeleteExpense`) are already written and unused. The page currently only
   creates and reviews. Wire up edit and delete, and add a "raise the expected
   amount to the charged amount" action on a flagged price increase — today the
   user has to retype it.
2. **Browser coverage.** The Playwright suite does not touch `/costs`. Add a
   spec that logs an expense and confirms a queued one, following
   `e2e/core-flows.spec.ts` (each spec registers its own workspace).
3. **The ingestion endpoint, only when manual entry becomes the bottleneck.**
   Build `POST /costs/ingest` exactly as specified in `docs/costs.md`: HMAC over
   the raw body with `COST_INGESTION_SECRET`, `ingestExpenseSchema` (already in
   contracts), always `PENDING_REVIEW`, idempotent on
   `(workspaceId, source, externalReference)` which the schema already enforces.
   Add the env var to `.env.example` **in the same commit as the route**, never
   before.

---

## How to test this manually

API only for now — there is no UI yet.

```bash
pnpm --filter @opshub/api build && pnpm --filter @opshub/api start
```

Get a token, then:

```bash
# create a vendor
curl -X POST localhost:4000/api/v1/costs/vendors   -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json'   -d '{"name":"Vercel"}'

# a monthly subscription for it
curl -X POST localhost:4000/api/v1/costs/subscriptions   -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json'   -d '{"vendorId":"<id>","name":"Vercel Pro","expectedAmount":"20.00"}'

# a real charge that came in higher
curl -X POST localhost:4000/api/v1/costs/expenses   -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json'   -d '{"vendorId":"<id>","subscriptionId":"<id>","amount":"25.00","incurredAt":"2026-07-04T00:00:00.000Z"}'

# the monthly close
curl "localhost:4000/api/v1/costs/summary?month=2026-07" -H "Authorization: Bearer $TOKEN"
```

Expect `expected 20.00`, `actual 25.00`, `difference 5.00`, and one price
increase at 25%.
