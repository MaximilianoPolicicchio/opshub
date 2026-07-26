import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const COOKIE_NAME = "opshub_refresh";
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days, matches API refresh TTL

/**
 * Thin server-side session bridge. The browser never sees the refresh token —
 * it only ever talks to this route, which holds it in an httpOnly cookie and
 * exchanges it with the real API. See PROJECT_PLAN.md §4 / §5.
 */

/**
 * `secure` defaults to on in production, which is correct behind HTTPS but
 * silently breaks a production build served over plain http://localhost — the
 * cookie is set and never sent back, so every reload looks like a logged-out
 * user. COOKIE_SECURE exists for exactly that case (local production runs and
 * browser tests). Unset, the safe default applies.
 */
const COOKIE_SECURE =
  process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production";

function setRefreshCookie(response: NextResponse, refreshToken: string) {
  response.cookies.set(COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

/** Called right after login/register with the tokens the API returned. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const refreshToken = body?.refreshToken;
  if (typeof refreshToken !== "string" || !refreshToken) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Missing refreshToken" } }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true });
  setRefreshCookie(response, refreshToken);
  return response;
}

/** Called by the api-client on 401s and on app boot to obtain a fresh access token. */
export async function GET(req: NextRequest) {
  const refreshToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: { code: "NO_SESSION", message: "No session cookie" } }, { status: 401 });
  }

  const apiRes = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!apiRes.ok) {
    const response = NextResponse.json({ error: { code: "SESSION_EXPIRED", message: "Session expired" } }, { status: 401 });
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  const json = await apiRes.json();
  const { accessToken, refreshToken: newRefreshToken } = json.data as { accessToken: string; refreshToken: string };

  const response = NextResponse.json({ accessToken });
  setRefreshCookie(response, newRefreshToken);
  return response;
}

/** Logout: revokes the refresh token server-side (best-effort) and clears the cookie. */
export async function DELETE(req: NextRequest) {
  const refreshToken = req.cookies.get(COOKIE_NAME)?.value;
  if (refreshToken) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // best-effort; still clear the local cookie below
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
