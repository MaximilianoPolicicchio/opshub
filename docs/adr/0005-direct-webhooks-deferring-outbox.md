# ADR 0005 — Direct webhook dispatch now, transactional outbox later

**Status:** accepted · **Date:** 2026-07-26

## Context

Four events should reach n8n: a high-priority task going overdue, project health
changing, a budget threshold being crossed, and a weekly review being generated.

The robust pattern is a transactional outbox: write the event to a table in the
same transaction as the state change, and let a worker deliver it with retries,
backoff, and dead-lettering. The simple pattern is to POST inline.

## Decision

Dispatch inline, with two retries (1s then 4s, on network errors and 5xx only)
and a 5-second timeout. Record **every attempt** as an `AutomationRun` —
`SUCCESS`, `FAILED`, `SIMULATED` when no URL is configured or the user clicked
simulate, and `SKIPPED` when the automation is disabled or filtered out.

Auto-triggered runs carry a `dedupeKey` of `<TRIGGER>:<entityId>:<YYYY-MM-DD>`
with a unique index, so the daily overdue scan cannot fire twice for the same
task in a day. Manual runs leave it null; Postgres unique indexes ignore nulls,
so manual re-runs are unlimited.

When `N8N_WEBHOOK_URL` is unset the payload is still built, still recorded, and
still shown in the UI — the integration is inspectable without an n8n instance.

## Alternatives considered

**Transactional outbox with a worker.** The correct answer for at-least-once
delivery. Deferred deliberately: it adds a table, a worker loop, locking to
prevent double processing, abandoned-job recovery, and a replay UI — a
meaningful amount of machinery for a single-user tool whose consumers are
idempotent n8n workflows.

**BullMQ or SQS.** Same reasoning plus a Redis or cloud dependency, against a
stated goal of no Docker requirement for local development.

## Consequences

- Delivery is **at-most-once**. A crash between the state change and the POST
  loses the notification permanently. `AutomationRun` always records the attempt
  and the payload, so it is diagnosable and manually re-sendable, but it is not
  recovered automatically.
- A slow or hanging webhook adds latency to the request that triggered it,
  bounded at roughly 5s plus retries.
- The payload is signed with HMAC-SHA256 in `X-OpsHub-Signature` when
  `N8N_WEBHOOK_SECRET` is set. Consumers should verify over the raw body.

The honest framing: this is a deliberate simplification with a known failure
mode, not an oversight. The dedupe key and the run history are the parts that
would survive the migration to an outbox unchanged.

## Revisit when

Any of: a missed notification actually costs something; a second consumer that
is not idempotent appears; webhook latency starts showing up in request times; or
delivery needs an audit trail stronger than "we tried". At that point the outbox
is a contained change — the payload builder and `AutomationRun` already exist,
so it is a new table plus a worker, not a redesign.
