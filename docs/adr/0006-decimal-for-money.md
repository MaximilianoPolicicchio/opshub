# ADR 0006 — Decimal for money, integer minutes for duration

**Status:** accepted · **Date:** 2026-07-26

## Context

Budget burn multiplies tracked hours by a rate and compares the result against a
budget, then fires alerts at 50/75/90/100%. Any of that done in binary floating
point drifts, and a threshold comparison that is wrong by a cent fires — or
fails to fire — an alert.

## Decision

- Money: Prisma `Decimal @db.Decimal(12, 2)`; rates `Decimal(10, 2)`; hours
  `Decimal(8, 2)`. All arithmetic through `decimal.js`. Never a JS `number`.
- Duration: **integer minutes**, always server-computed as
  `round((endTime - startTime) / 60000)`, minimum 1. Clients never send a
  duration.
- Rounding: money to 2 decimals, percentages to 2 decimals, `ROUND_HALF_UP`.

Values cross the API boundary as JSON numbers or strings, but every computation
that decides an alert or a remaining balance happens in `Decimal` on the server.

## Consequences

- `Decimal` values must be converted explicitly (`.toNumber()`) at the boundary,
  which is friction — but it is friction in the right place, because it makes
  every lossy conversion visible in the diff.
- The budget calculator is a pure function taking primitives and returning
  `Decimal`, unit-tested without a database, including the fixed-price fallback
  when `estimatedHours` is null (percentage is null rather than a divide-by-zero,
  and the UI falls back to hours-based burn).
- Integer minutes mean no fractional-second drift when summing hundreds of
  entries into a weekly total, and the exclusion constraint compares clean
  ranges.

## Revisit when

Multi-currency conversion arrives. Values are stored per budget and **never**
converted today; Financial Overview groups totals by currency instead. Adding
conversion means storing a rate and a rate date alongside each amount, which is
a schema change and deserves its own record.
