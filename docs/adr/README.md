# Architecture decision records

Short records of decisions that were not obvious, written so the reasoning
survives the person who made it. Each states what was chosen, what was rejected
and why, what it costs, and the condition that should trigger a rethink.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-explicit-tenant-scoping.md) | Explicit tenant scoping instead of a Prisma client extension | accepted |
| [0002](0002-concurrency-in-postgres.md) | Enforce timer and time-entry concurrency in Postgres | accepted |
| [0003](0003-interval-recurrence-not-rrule.md) | Interval-based recurrence, generated on completion | accepted |
| [0004](0004-refresh-token-rotation.md) | Rotating refresh tokens with reuse detection | accepted |
| [0005](0005-direct-webhooks-deferring-outbox.md) | Direct webhook dispatch now, transactional outbox later | accepted |
| [0006](0006-decimal-for-money.md) | Decimal for money, integer minutes for duration | accepted |
| [0007](0007-dependency-severity-policy.md) | Fail CI on critical advisories only | accepted |
| [0008](0008-costs-manual-first.md) | Operating costs: manual entry first, mailbox ingestion later | accepted |

## Writing a new one

Copy the shape of an existing record: context, decision, alternatives
considered, consequences, revisit when. Number sequentially. A record is never
edited after acceptance — supersede it with a new one and mark the old one
`superseded by NNNN`, so the history of the reasoning stays readable.

The consequences section is the one that matters. A record that lists only
benefits is not a decision record, it is an advertisement.
