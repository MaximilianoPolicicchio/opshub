"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { TimeEntry, TimeReportResult } from "@/lib/types";

export interface TimeEntryFilters {
  projectId?: string;
  taskId?: string;
  from?: string;
  to?: string;
  billable?: string;
  [key: string]: string | undefined;
}

function toQueryString(filters: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function useTimeEntries(filters: TimeEntryFilters = {}) {
  return useQuery({
    queryKey: queryKeys.timeEntries(filters),
    queryFn: () => api.get<TimeEntry[]>(`/time-entries${toQueryString(filters)}`),
  });
}

export function useTimeReports(params: { groupBy: "project" | "day" | "week" | "task"; from?: string; to?: string; projectId?: string }) {
  return useQuery({
    queryKey: queryKeys.timeReports(params as Record<string, string | undefined>),
    queryFn: () => api.get<TimeReportResult>(`/time-entries/reports${toQueryString(params)}`),
  });
}

function invalidateTimeEntries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["time-entries"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["financial-overview"] });
}

export function useCreateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<TimeEntry>("/time-entries", input),
    onSuccess: () => invalidateTimeEntries(qc),
  });
}

export function useUpdateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      api.patch<TimeEntry>(`/time-entries/${id}`, input),
    onSuccess: () => invalidateTimeEntries(qc),
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/time-entries/${id}`),
    onSuccess: () => invalidateTimeEntries(qc),
  });
}
