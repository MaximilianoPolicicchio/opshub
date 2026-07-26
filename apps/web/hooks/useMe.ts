"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth";
import type { MeResponse } from "@/lib/types";

export function useMe() {
  const { status } = useAuth();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<MeResponse>("/auth/me"),
    enabled: status === "authenticated",
    staleTime: 30_000,
  });
}
