# Automations and the n8n webhook contract

OpsHub emits outbound webhooks on four events. A real n8n instance is **not**
required: with no URL configured the payload is still built, still recorded, and
still shown in the UI, so the integration is inspectable end to end without one.

Design rationale and the at-most-once trade-off:
[ADR 0005](adr/0005-direct-webhooks-deferring-outbox.md).

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `N8N_WEBHOOK_URL` | unset | Absent is a normal state, not an error — runs are recorded as `SIMULATED` |
| `N8N_WEBHOOK_SECRET` | unset | When set, payloads are signed |
| `N8N_WEBHOOK_TIMEOUT_MS` | `5000` | Per-attempt timeout |

## Envelope

`POST`, `Content-Type: application/json`:

```jsonc
{
  "eventType": "budget.threshold.reached",
  "eventId": "clx...",              // == AutomationRun.id, for consumer idempotency
  "occurredAt": "2026-07-26T14:03:11.442Z",
  "workspace": { "id": "...", "name": "Demo Ops", "slug": "demo-ops" },
  "project":   { "id": "...", "name": "Hernan Shop", "type": "CLIENT_PRODUCT",
                 "status": "ACTIVE", "health": "NEEDS_ATTENTION" },
  "automation": { "id": "...", "name": "Budget threshold alert",
                  "trigger": "BUDGET_THRESHOLD_REACHED" },
  "simulated": false,
  "payload": { }
}
```

`project` is null for workspace-level events. **Use `eventId` for idempotency** —
it is the run id and is stable across retries of the same attempt.

## Events

| `eventType` | `payload` |
| --- | --- |
| `task.overdue.high_priority` | `taskId, title, priority, category, status, dueDate, daysOverdue` |
| `project.health.changed` | `from, to, reason, openHighPriorityCount, overdueCount` |
| `budget.threshold.reached` | `budgetId, threshold, burnPercent, trackedValue, budgetAmount, currency, remainingAmount, billingModel` |
| `weekly_review.generated` | `periodStart, periodEnd, tasksCompleted, hoursTracked, billableHours, projectsAtRisk[], upcomingDue[]` |

## Verifying the signature

With `N8N_WEBHOOK_SECRET` set, requests carry:

```
X-OpsHub-Signature: sha256=<hex hmac of the raw body>
```

Compute the HMAC over the **raw request body**, before any JSON parsing —
re-serializing changes key order and whitespace and will not match. Compare in
constant time.

```js
const crypto = require("crypto");

function verify(rawBody, header, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret)
    .update(rawBody).digest("hex");
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

In n8n, use a Webhook node with raw-body enabled and do this in a Function node
before trusting anything downstream.

## Run recording

Every attempt writes exactly one `AutomationRun`:

| Situation | `status` | `simulated` |
| --- | --- | --- |
| 2xx response | `SUCCESS` | false |
| non-2xx, timeout or DNS failure after retries | `FAILED` | false |
| `N8N_WEBHOOK_URL` unset | `SIMULATED` | true |
| "Simulate run" clicked in the UI | `SIMULATED` | true |
| automation disabled or filtered out by config | `SKIPPED` | false |

Retries: two, at 1s and 4s, on network errors and 5xx only. A 4xx is a permanent
failure and is not retried.

Only `FAILED` runs reach the activity feed — successes are visible in run history
and would otherwise drown it.

**Deduplication.** Auto-triggered runs carry
`dedupeKey = "<TRIGGER>:<entityId>:<YYYY-MM-DD>"` behind a unique index, so the
daily overdue scan cannot fire twice for the same task in one day. Manual and
simulated runs leave it null; Postgres unique indexes ignore nulls, so manual
re-runs are unlimited.

## Trying it without n8n

Leave `N8N_WEBHOOK_URL` unset, open **Automations**, and click **Simulate run**.
The run is recorded as `SIMULATED` with the exact payload that would have been
sent, and appears immediately in run history with its status, duration and body.
