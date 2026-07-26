/**
 * In-memory access-token holder. Never persisted to localStorage/sessionStorage.
 * The refresh token lives only in an httpOnly cookie managed by
 * app/api/session/route.ts. This module is a tiny pub/sub so both the
 * AuthProvider (React state, for rendering) and the plain api-client fetch
 * wrapper (outside React) can read/write the same value.
 */

type Listener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((l) => l(token));
}

export function subscribeAccessToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
