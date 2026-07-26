"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, tryRefresh } from "./api-client";
import { setAccessToken } from "./token-store";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthResponse {
  user: { id: string; email: string; name: string; timezone: string };
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name: string; workspaceName: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistSession(tokens: { accessToken: string; refreshToken: string }) {
  setAccessToken(tokens.accessToken);
  await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Must reuse the api-client's single-flight refresh: refresh tokens are
        // rotated, so two concurrent calls (e.g. StrictMode's double-mount in
        // dev) would look like token reuse and revoke the session.
        const ok = await tryRefresh();
        if (!cancelled) setStatus(ok ? "authenticated" : "unauthenticated");
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/auth/login", { email, password }, { skipAuthRetry: true });
    await persistSession(res);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; name: string; workspaceName: string }) => {
      const res = await api.post<AuthResponse>("/auth/register", input, { skipAuthRetry: true });
      await persistSession(res);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(async () => {
    await fetch("/api/session", { method: "DELETE" });
    setAccessToken(null);
    setStatus("unauthenticated");
    router.push("/login");
  }, [router]);

  return <AuthContext.Provider value={{ status, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
