# Business rules

The rules the product enforces, with the exact predicates. Each is implemented as
a dependency-free `*.logic.ts` module and unit-tested without a database; the
Prisma-backed service wraps it.

## Actionable work (the Today view)

A task is actionable when **all** of:

1. not archived and `status != DONE`;
2. not blocked — evaluated live with a `NOT EXISTS` over unresolved
   dependencies, not from the cached flag;
3. the parent project is `ACTIVE` or `MAINTENANCE` and not archived;

**and at least one of**: due today or overdue · `IN_PROGRESS` (already started)
· manually pinned for today · `NEXT` with `CRITICAL`/`HIGH` priority, capped at
five so Today never becomes a dump.

Ordering: overdue first, then priority, then earliest due date, then manual
order. `WAITING` tasks appear in a separate collapsed section and are **not**
counted as actionable — that is the point of the status.

## Dependency gating

A task is blocked when at least one `TaskDependency` exists whose prerequisite
is not `DONE` and not archived.

`Task.isBlocked` is a denormalised cache used for listing and sorting. It is
**never** trusted for the write guard: moving a task to `DONE` re-counts
unresolved prerequisites inside the transaction, with the prerequisite rows
locked. If any remain, the API returns 409 `TASK_BLOCKED_BY_DEPENDENCY` with the
blocking ids.

Moving to any non-`DONE` status is always allowed — being blocked should not
prevent you from parking something. Dependencies are same-project only, and
cycles are rejected on creation via a recursive reachability check.

## Project health

Recomputed after every task status/priority/due-date change and nightly.
Deterministic, first match wins, with `HIGH` meaning `CRITICAL` or `HIGH` and
`open` meaning not `DONE` and not archived:

```
BLOCKED           if any HIGH + open + blocked task exists
                  or any HIGH task has sat in WAITING for over 7 days

NEEDS_ATTENTION   if any HIGH + open task is overdue
                  or 3 or more open tasks are overdue
                  or budget burn >= 90%
                  or (status = ACTIVE and no activity for 14 days)

HEALTHY           otherwise
```

`PAUSED` and `ARCHIVED` short-circuit to `HEALTHY` — a parked project is not
unhealthy. Every branch stores a human-readable reason, and a change writes an
activity event and fires the health webhook.

## Time tracking

- At most one running timer per user, enforced by a partial unique index.
- Closed entries for a user may not overlap, enforced by a GiST exclusion
  constraint. Back-to-back entries are legal.
- Duration is always server-computed in whole minutes, minimum 1. Clients never
  send it, and a stop time at or before the start is rejected.

See [ADR 0002](adr/0002-concurrency-in-postgres.md).

## Budget burn

Scoped to the project and, when set, the budget's date window.

```
trackedHours   = sum(durationMinutes) / 60
billableHours  = sum(durationMinutes where billable) / 60

HOURLY:       trackedValue = billableHours * hourlyRate
FIXED_PRICE:  trackedValue = billableHours * (budgetAmount / estimatedHours)
              -> null when estimatedHours is null or 0
INTERNAL:     trackedValue = trackedHours * (hourlyRate ?? 0)   // cost view only

valueBurnPercent = trackedValue / budgetAmount * 100      (when budget > 0)
hoursBurnPercent = trackedHours / estimatedHours * 100    (when estimate > 0)
burnPercent      = valueBurnPercent ?? hoursBurnPercent ?? 0

remainingAmount  = budgetAmount - trackedValue     // may go negative
remainingHours   = estimatedHours - trackedHours   // may go negative
```

All in `Decimal` — see [ADR 0006](adr/0006-decimal-for-money.md). `INTERNAL`
budgets are excluded from revenue totals and never fire alerts.

## Budget alerts

Thresholds 50/75/90/100 fire **once each, ever**. The dedupe is a unique index
on `(projectBudgetId, threshold)` plus `createMany({ skipDuplicates: true })` —
not an application check that could race.

Crossing 50 and 75 in one large entry fires both, in ascending order. Deleting
time so burn drops back below a threshold does **not** clear the alert:
thresholds are historical facts, not current state. Only editing the budget
amount, rate, or estimated hours prunes alerts above the new burn, so they can
fire again meaningfully.

## Recurrence

Interval + unit + anchor, generated only on completion. See
[ADR 0003](adr/0003-interval-recurrence-not-rrule.md).

## Activity events

A deliberately closed list — project created / status changed / health changed,
task created / status changed / completed / blocked / unblocked, priority changes
to or from HIGH only, milestone completed, time logged, budget created,
threshold reached, failed automation runs, weekly review generated.

Field edits — title, description, tags, links, notes — deliberately produce **no**
event. A feed that records everything is a feed nobody reads. Every event also
bumps the project's last-activity timestamp in the same transaction, which is
what the 14-day inactivity health rule reads.
