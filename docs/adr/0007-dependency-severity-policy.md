# ADR 0007 — Fail CI on critical advisories only

**Status:** accepted · **Date:** 2026-07-26

## Context

A first audit reported 51 advisories in production dependencies: 1 critical, 23
high, 24 moderate, 3 low. Almost none were in code this project wrote.

Gating on "any high" would have made CI permanently red on day one, and a
permanently red gate is worse than no gate — people stop reading it.

## Decision

CI originally failed on **critical** only, with high and moderate printed but
non-blocking. **Updated 2026-07-26:** the Next.js 15 upgrade cleared the last
outstanding high, so the gate is now `--audit-level high`. There are no accepted
exceptions left, which means a new high advisory is genuinely new rather than
noise — the condition this record set for tightening.

Any exception that has to be accepted in future is justified in the commit that
introduces it, not in a file nobody rereads.

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
- Moderates are still only reported. They can accumulate unread, which is the
  same weakness the original policy had one severity higher. Dependabot raising
  PRs is the mitigation, rather than relying on someone reading CI output.
- Result: 51 advisories (1 critical, 23 high) reduced to **6 (0 critical, 0
  high)** — 5 moderate and 1 low remain, none with a fix available that does not
  require another major.

## Revisit when

Moderates start hiding something that matters, or a high appears with no
upstream fix. The latter is the real test of this policy: the answer is to
document the exception in the commit that accepts it and set a condition for
removing it, not to quietly lower the gate again.
