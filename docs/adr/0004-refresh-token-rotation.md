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

**Resolved: the reload race.** Rotation has a second failure mode beyond
concurrent calls. Reload the page while the boot refresh is still in flight and
the rotated cookie never lands, so the next page load replays the previous
token — indistinguishable from theft, and the family was revoked. Users were
logged out permanently for double-tapping reload. It reproduced only against a
production build, because `next dev` is slow enough that the exchange completes
first.

The fix is a **grace window**: a token replayed within `REFRESH_REUSE_GRACE_MS`
(default 10s) of its own rotation is treated as a benign retry and served a
fresh token, leaving the family intact. Outside the window, reuse is still theft
and still revokes everything.

The trade-off is explicit: an attacker replaying a stolen token inside that
window is not detected. To be there they must already have intercepted a token
that is legitimately in use at that moment, so the window is not the weakest
link in that scenario — whereas locking real users out of their own account was
a guaranteed, everyday cost.

Pinned by `refresh-grace.e2e-spec.ts` on both sides of the window, and by a
browser regression test that reloads immediately after navigating.

## Revisit when

The window needs to shrink under a stricter threat model, or a stolen-token
alert is wanted. The stronger version records the successor on the revoked row
and re-serves *that* token instead of minting a new one, which keeps the chain
single-threaded — it needs a migration, which is why it was not done first.
