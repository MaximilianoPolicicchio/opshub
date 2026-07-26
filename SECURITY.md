# Security

OpsHub is a personal operations tool published as a portfolio project. It is not
a hosted service, and there is no production deployment holding anyone's data.
Reports are still welcome — this document says what the project actually does so
you can judge it accurately.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/MaximilianoPolicicchio/opshub/security/advisories/new)
rather than a public issue. Expect a reply within a week.

## What is implemented

**Multi-tenant isolation.** Every tenant-owned row carries a denormalized
`workspaceId`. Reads use `findFirst({ id, workspaceId })` rather than
`findUnique({ id })`, so an id belonging to another workspace returns 404 rather
than 403 and does not disclose existence. Every `update` and `delete` also
carries `workspaceId` in its own `where`, so the mutation is authoritative
instead of trusting a preceding ownership check — a cross-tenant id raises
`P2025`. `apps/api/src/prisma/tenant-scoping.arch.spec.ts` fails the build if a
write to a tenant-owned model is added without it.

**Authentication.** Short-lived access JWTs (15 min) plus opaque refresh tokens
stored hashed with SHA-256. Refresh tokens rotate on every use; presenting an
already-rotated token revokes the whole family for that user. Passwords are
hashed with bcrypt at cost 12.

**Token storage.** The access token is held in memory only. The refresh token
lives in an httpOnly, SameSite=Lax cookie set by a Next route handler, so it is
never readable from JavaScript. Nothing is written to `localStorage`.

**Input validation.** All auth payloads are validated with shared Zod schemas at
the boundary. Emails are trimmed and lowercased, timezones checked against the
runtime's IANA database, and passwords held to a length-first policy with a
small common-password denylist.

**Rate limiting.** Per-endpoint: register and change-password 5/hour, login
5/15min, refresh 30/15min. Controlled by `THROTTLE_ENABLED`, which defaults to
on, so a missing value gives you throttling rather than its absence.

**Database-level integrity.** One active timer per user is a partial unique
index; overlapping time entries are prevented by a GiST exclusion constraint.
These are enforced by Postgres, not only by application code.

## What is deliberately not implemented

- **No Postgres row-level security.** Isolation is enforced in the application
  layer. A raw SQL console, or a future service bypassing these helpers, is not
  covered. RLS is the natural next hardening step.
- **No 2FA, SSO, or password reset email.** Password changes require the current
  password while signed in.
- **No CSRF token on the session route.** It relies on SameSite=Lax plus the
  fact that the endpoint only exchanges a cookie the browser already holds.
- **Webhook delivery is at-most-once** with two retries and no durable queue.
  Payloads are signed with HMAC-SHA256 when `N8N_WEBHOOK_SECRET` is set.

## Dependency policy

CI fails on **critical** advisories in production dependencies. High-severity
advisories are reported but non-blocking, because the ones currently outstanding
are Next.js issues requiring a major upgrade, tracked separately. Build-time-only
advisories are not treated as release blockers, and the reasoning is recorded in
the commit that introduces each exception.

Dependabot proposes weekly updates for npm and GitHub Actions; majors are opt-in.

## Demo data

Every seeded project, task, budget figure and time entry is fabricated. The
project names come from the author's own work, but no real customer, financial,
patient, or credential data exists anywhere in this repository. The seed refuses
to run against `NODE_ENV=production` without an explicit override, and its demo
password is printed with a warning that it is development-only.
