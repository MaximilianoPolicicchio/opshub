"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { TimeEntry } from "@/lib/types";

export function useActiveTimer() {
  return useQuery({
    queryKey: queryKeys.timeEntriesActive,
    queryFn: () => api.get<TimeEntry | null>("/time-entries/active"),
    refetchInterval: 30_000,
  });
}

export function useStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; taskId?: string | null; description?: string | null; billable?: boolean; onConflict?: "reject" | "stopPrevious" }) =>
      api.post<TimeEntry>("/time-entries/start", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.timeEntriesActive });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; endTime?: string } = {}) => api.post<TimeEntry>("/time-entries/stop", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.timeEntriesActive });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: queryKeys.me });
      qc.invalidateQueries({ queryKey: ["time-entries"] });
    },
  });
}

export function isConflict409(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409;
}
