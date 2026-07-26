"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { WeeklyReview } from "@/lib/types";

export function useWeeklyReview(weekStart?: string) {
  return useQuery({
    queryKey: queryKeys.weeklyReview(weekStart),
    queryFn: () => api.get<WeeklyReview | null>(`/weekly-review${weekStart ? `?weekStart=${weekStart}` : ""}`),
  });
}

export function useGenerateWeeklyReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weekStart?: string) => api.post<WeeklyReview>("/weekly-review/generate", { weekStart }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-review"] }),
  });
}
