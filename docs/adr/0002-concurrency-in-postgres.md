# ADR 0002 — Enforce timer and time-entry concurrency in Postgres

**Status:** accepted · **Date:** 2026-07-26

## Context

Two rules have to hold no matter how the API is called:

1. A user may have at most one running timer.
2. A user's closed time entries may not overlap.

Both are trivially violated by a double-clicked button, two browser tabs, or a
retried request — the classic read-then-write race. Application checks alone
cannot close it, because between `findFirst` and `create` another request can
interleave.

## Decision

Enforce both in the database, and keep the application checks only for error
quality.

**One active timer** — a partial unique index, expressible in raw SQL but not in
the Prisma schema:

```sql
CREATE UNIQUE INDEX time_entry_one_active_per_user
  ON "TimeEntry" ("userId") WHERE "endTime" IS NULL;
```

**No overlap** — a GiST exclusion constraint. `btree_gist` supplies the equality
operator class for the `userId` column:

```sql
ALTER TABLE "TimeEntry" ADD CONSTRAINT time_entry_no_overlap
  EXCLUDE USING gist (
    "userId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  ) WHERE ("endTime" IS NOT NULL);
```

The `[)` bounds make back-to-back entries (10:00–11:00 and 11:00–12:00) legal,
which is what users expect.

Both live inside a normal Prisma migration file, hand-edited after
`migrate diff`, so they survive `migrate deploy` and are never lost when the
schema is regenerated.

The service still checks first, and maps `P2002` to a 409 and `23P01` to a 422
with the conflicting entry id. That is a user-experience concern, not the
correctness mechanism.

## Consequences

- The rules hold under concurrency, and would hold even for a second client
  talking to the same database.
- Postgres needs `btree_gist`. That is a real deployment requirement: CI creates
  and verifies it, `compose.yaml` creates it in both an initdb script and the
  migrate service, and the README documents it. A managed database whose user
  cannot `CREATE EXTENSION` cannot run this schema.
- `tstzrange` requires the timestamp columns to be `timestamptz`; the expression
  is not immutable over `timestamp(3)`, which is how this first failed.
- Overlap detection logic is still unit-tested as a pure function, because the
  API should return a useful message rather than a driver error.

## Revisit when

Time entries need to span users or projects in a way that makes a single
exclusion constraint insufficient, or if the database moves somewhere that
forbids extensions — in which case the guarantee weakens to advisory locks or a
serializable transaction, and that trade-off should be recorded here.
