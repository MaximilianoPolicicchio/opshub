# Security engineering notes

`../SECURITY.md` is the public summary and reporting policy. This is the detail
behind it.

## Threat model

Single-owner tool, published as open source, with the collaborator model present
in the schema but not exposed. The threats that matter:

1. **Cross-tenant access** — the model is multi-tenant even though there is one
   user, so a bug here would be a real breach the moment a second user exists.
2. **Credential theft** — token storage and session handling in a browser.
3. **Unauthenticated abuse** — registration and login are public endpoints.
4. **Supply chain** — most of the shipped bytes are dependencies.

Explicitly out of scope: a malicious authenticated owner (they own the data), and
denial of service beyond basic rate limiting.

## Tenant isolation

Reads use `findFirst({ id, workspaceId })`, never `findUnique({ id })`, so a
foreign id yields **404, not 403** — 403 confirms the resource exists, which is
itself a disclosure.

Writes carry `workspaceId` in their own `where`, so the mutation is authoritative
rather than trusting a preceding check. Prisma 5 allows extra non-unique filters
alongside a unique field, so this stays a valid `WhereUniqueInput` and a
cross-tenant id raises `P2025`.

`workspaceId` comes from `WorkspaceGuard`, resolved from the header or membership
— **never from a request body**. A client cannot assert which workspace it is in.

`apps/api/src/prisma/tenant-scoping.arch.spec.ts` fails the build if a mutation
omits it. Verified by reintroducing violations and confirming detection; five e2e
cases assert cross-tenant writes 404 *and* leave the row unchanged, plus that the
owner's own call still succeeds — otherwise the 404s would prove nothing.

Full reasoning: [ADR 0001](adr/0001-explicit-tenant-scoping.md).

## Sessions

Access JWT, 15 minutes, **memory only**. Refresh token: 64 random bytes, stored
as a SHA-256 hash, delivered in an httpOnly `SameSite=Lax` cookie set by a Next
route handler. Nothing in `localStorage`, so an XSS cannot exfiltrate a
long-lived credential.

Rotation on every use, with reuse detection revoking the whole family.
**Consequence:** concurrent refreshes are indistinguishable from theft, so all
refreshes must go through one single-flight promise. This shipped as a bug —
React StrictMode double-invoked the boot effect and logged users out on reload.
See [ADR 0004](adr/0004-refresh-token-rotation.md).

## Input validation

All auth payloads validated with shared Zod schemas at the boundary. Before this,
handlers typed bodies with inline TypeScript interfaces — erased at compile time,
so the endpoints accepted any JSON at all.

- Emails trimmed and lowercased, so casing cannot create a shadow account.
- Passwords: length-first (min 10) plus a small common-password denylist. No
  composition rules — they push people toward `Password1!` without adding
  entropy.
- Timezones validated by asking `Intl`, not against a list that goes stale.
- Names rejected when blank or containing control characters.

**Login deliberately does not apply the password policy.** Returning 400 for a
short password would tell an attacker the shape was wrong before any credential
check ran. Bad logins fail as 401, uniformly.

A subtle failure worth recording: the pipes must be attached to `@Body()`, not
via method-level `@UsePipes`, which validates *every* parameter including
`@CurrentUser()` and made authenticated routes return 400 unconditionally — while
tests asserting 400 "passed".

## Rate limiting

Per endpoint, by abuse profile: register and change-password 5/hour, login
5/15min, refresh 30/15min. Behind `ConditionalThrottlerGuard` and
`THROTTLE_ENABLED`, which **defaults to enabled** so a missing value gives
throttling rather than its absence. `throttling.e2e-spec.ts` re-enables it to
prove the limits fire, and that disabling really disables them.

Limits are per IP, not per IP+account, so a distributed attempt against one
account is not covered.

## Dependencies

CI fails on critical advisories; highs are reported but non-blocking while the
Next.js major is outstanding. Reasoning and the tightening condition:
[ADR 0007](adr/0007-dependency-severity-policy.md).

## Known gaps

- **No row-level security.** Isolation is in application code. Anything reaching
  Postgres by another path is uncovered.
- **No CSRF token** on the session route. It relies on `SameSite=Lax` and the
  fact that the endpoint only exchanges a cookie the browser already holds.
- **Refresh reuse has a 10-second grace window** (`REFRESH_REUSE_GRACE_MS`), so
  a replay inside it is served rather than detected. This exists because a
  reload racing the boot refresh was revoking real users' sessions. See
  [ADR 0004](adr/0004-refresh-token-rotation.md).
- **Health endpoint is not split** into liveness and readiness, so a database
  blip can restart the process.
- No 2FA, SSO, password reset, or account lockout.
