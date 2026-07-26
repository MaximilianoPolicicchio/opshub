# ADR 0003 — Interval-based recurrence, generated on completion

**Status:** accepted · **Date:** 2026-07-26

## Context

Recurring maintenance work — "check backups weekly", "refresh dependencies
monthly" — needs to reappear. Two questions: how is the schedule expressed, and
when is the next occurrence created?

## Decision

**Schedule:** `recurrenceInterval` (integer ≥ 1) + `recurrenceUnit`
(`DAY`/`WEEK`/`MONTH`) + `recurrenceAnchor` (`DUE_DATE` or `COMPLETION_DATE`) +
optional `recurrenceEndsAt`. No RRULE.

**Generation:** the next occurrence is created only when a recurring task
transitions to `DONE`, inside that same transaction. No cron generates tasks.

Date maths:

- `DUE_DATE`: next due is previous due + interval. If that is already past —
  the task was finished very late — roll forward in whole intervals until it is
  not, so the clone is never born overdue.
- `COMPLETION_DATE`: next due is completion + interval.
- Month arithmetic clamps to end of month: Jan 31 + 1 month is Feb 28 or 29.

Idempotency comes from `@@unique([recurrenceSeriesId, occurrenceIndex])`. A
retried or double-submitted completion collides with the index and is swallowed,
so a series can never fork.

## Alternatives considered

**Full RRULE.** Handles "third Tuesday" and "every weekday except holidays".
Rejected as unjustified for a solo operator's chores: it means a parsing
dependency, a much larger test surface, and a UI to express it. The fields chosen
are a strict subset, so adding an `rrule` column later is additive rather than a
migration of existing data.

**Cron-generated occurrences.** Rejected because it produces exactly the failure
users hate: come back from two weeks away and find twelve identical "weekly
backup check" tasks. Generating on completion guarantees at most one open
occurrence per series, which is what someone triaging their morning actually
wants.

## Consequences

- A recurring task that is never completed never recurs. That is intentional —
  it stays visible and overdue, which is the correct signal — but it means
  recurrence cannot be used for anything that must appear on a date regardless
  of whether the previous one was done.
- Recurrence maths is a pure function, unit-tested without a database, including
  the month-clamping and roll-forward cases.
- Editing recurrence settings affects future occurrences only.
- Date maths runs in UTC rather than the workspace's IANA zone. Far from UTC this
  can shift a boundary by a day. Recorded as known debt, not a hidden detail.

## Revisit when

A real need for calendar-shaped rules appears ("first business day of the
month"), or when the timezone approximation causes a visible off-by-one — at
which point the fix is to do the arithmetic in the workspace zone before storing
UTC.
