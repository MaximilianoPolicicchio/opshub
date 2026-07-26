"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Milestone } from "@/lib/types";

export function useMilestones(projectId: string) {
  return useQuery({
    queryKey: queryKeys.milestones(projectId),
    queryFn: () => api.get<Milestone[]>(`/projects/${projectId}/milestones`),
    enabled: !!projectId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.milestones(projectId) });
  qc.invalidateQueries({ queryKey: queryKeys.projectOverview(projectId) });
}

export function useCreateMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<Milestone>(`/projects/${projectId}/milestones`, input),
    onSuccess: () => invalidate(qc, projectId),
  });
}

export function useUpdateMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      api.patch<Milestone>(`/milestones/${id}`, input),
    onSuccess: () => invalidate(qc, projectId),
  });
}

export function useDeleteMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/milestones/${id}`),
    onSuccess: () => invalidate(qc, projectId),
  });
}
