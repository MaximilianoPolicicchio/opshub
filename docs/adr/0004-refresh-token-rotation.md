# ADR 0004 — Rotating refresh tokens with reuse detection

**Status:** accepted · **Date:** 2026-07-26

## Context

The web app is a browser client talking to a separate API. Sessions must survive
a page reload without leaving a long-lived credential where a script can read it.

## Decision

Short-lived access JWTs (15 minutes) held **in memory only**, plus an opaque
64-byte refresh token stored **hashed** (SHA-256) server-side and delivered to
the browser in an httpOnly, `SameSite=Lax` cookie.

Refresh tokens **rotate on every use**: exchanging one revokes it and issues a
new one. Presenting an already-revoked token is treated as theft and revokes the
entire family for that user, forcing re-authentication.

The cookie is set by a thin Next route handler (`app/api/session/route.ts`) that
exchanges it with the API. The browser never holds the refresh token in
JavaScript, and nothing is written to `localStorage`.

## Consequences

**Rotation makes concurrency a correctness problem, not just a performance one.**
Two simultaneous refreshes with the same cookie look exactly like token theft:
the second presents an already-rotated token and the family is revoked. This is
not theoretical — it shipped as a bug. React StrictMode double-invokes effects in
development, so the auth provider's boot effect fired two parallel refreshes and
logged the user out on every reload.

The fix is that **all refreshes must go through one single-flight promise**,
including the boot path. `tryRefresh()` in `lib/api-client.ts` owns it; nothing
else may call `/api/session` directly. That constraint is a permanent
consequence of choosing rotation, and it is commented at the call site because it
is not obvious from reading either piece in isolation.

- A reload costs one refresh round-trip before the app renders.
- Logout revokes server-side, so a stolen access token still expires within 15
  minutes and the refresh token is dead immediately.
- `secure` is on by default in production. That breaks a production build served
  over plain `http://localhost`, so `COOKIE_SECURE` exists as an explicit
  override for local runs and browser tests; unset, the safe default applies.

**Open issue:** session persistence works under `next dev` and currently fails
against a production build — the reload returns to the sign-in form. Secure-over-
HTTP has been ruled out. A residual race between the boot refresh and an
api-client 401 refresh tripping reuse detection is the leading suspect. Tracked
as a `test.fixme` in `e2e/core-flows.spec.ts`.

## Revisit when

The open issue is root-caused. If the race is confirmed, the options are to
suppress reuse-detection within a short grace window for the same token, or to
serialise refreshes server-side per user.
