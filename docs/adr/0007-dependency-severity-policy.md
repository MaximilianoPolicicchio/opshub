# ADR 0007 — Fail CI on critical advisories only

**Status:** accepted · **Date:** 2026-07-26

## Context

A first audit reported 51 advisories in production dependencies: 1 critical, 23
high, 24 moderate, 3 low. Almost none were in code this project wrote.

Gating on "any high" would have made CI permanently red on day one, and a
permanently red gate is worse than no gate — people stop reading it.

## Decision

CI fails on **critical**. High and moderate are printed on every run but do not
block. Each accepted exception is justified in the commit that introduces it,
not in a file nobody rereads.

Fixes are applied in this order, and only as far as necessary:

1. **Remove the dependency** if it is not earning its place. The single critical
   was `tar`, reached through `bcrypt` → `node-pre-gyp`. Swapping `bcrypt` for
   `bcryptjs` — pure JS, same API, same `$2a`/`$2b` hashes — removed the critical
   and seven highs at once, with no runtime behaviour change.
2. **Pin a transitive with a scoped override** when the parent has not shipped
   the fix. `lodash`, `multer` and `postcss` are pinned with `pkg@<version` keys,
   so the override disappears automatically once the parent updates.
3. **Schedule a major** when nothing smaller works. The eight remaining highs are
   all Next.js and need 14 → 15, handled as its own piece of work.

Dependabot proposes weekly updates for npm and GitHub Actions, grouped by
minor/patch. Majors are explicitly ignored so they arrive as deliberate work.

## Reasoning about severity

Severity is about the advisory, not about this application. A DoS in `multer`
matters if you accept uploads; this API registers no upload routes. Arbitrary
file write in `tar` matters at install time, not in the request path.

That reasoning is used to decide **urgency**, never to dismiss a finding
permanently. Every accepted exception names the reason and the condition that
would change it.

## Consequences

- The gate is meaningful, so a red audit job means something new and bad.
- Highs can accumulate silently if nobody reads the non-blocking output. The
  mitigation is Dependabot raising PRs rather than relying on someone checking.
- Result so far: 51 advisories (1 critical, 23 high) reduced to 27 (0 critical,
  8 high), with the remainder scoped to one tracked upgrade.

## Revisit when

The Next.js major lands. With the known highs cleared, the gate should tighten to
`--audit-level high` so new highs block rather than accumulate.
