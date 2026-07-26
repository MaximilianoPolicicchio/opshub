import { getAccessToken, setAccessToken } from "./token-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Calls our own thin Next route handler, which holds the httpOnly refresh cookie.
 *
 * Single-flight on purpose: the API rotates refresh tokens and treats a reused
 * one as theft, revoking the whole family. Two concurrent refreshes with the
 * same cookie would therefore log the user out. Every caller — including the
 * AuthProvider's boot effect, which React StrictMode runs twice in dev — must
 * go through this shared promise rather than fetching /api/session directly.
 */
export async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch("/api/session", { method: "GET", credentials: "include" });
        if (!res.ok) {
          setAccessToken(null);
          return false;
        }
        const body = (await res.json()) as { accessToken: string };
        setAccessToken(body.accessToken);
        return true;
      } catch {
        setAccessToken(null);
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip the automatic refresh-on-401 dance (used by auth endpoints themselves). */
  skipAuthRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuthRetry, headers, ...rest } = options;
  const token = getAccessToken();

  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const retryToken = getAccessToken();
      res = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers: {
          "Content-Type": "application/json",
          ...(retryToken ? { Authorization: `Bearer ${retryToken}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const errorBody: ApiErrorBody = json?.error ?? { code: "UNKNOWN", message: "Request failed" };
    throw new ApiError(res.status, errorBody);
  }

  return (json as Envelope<T>).data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
};
