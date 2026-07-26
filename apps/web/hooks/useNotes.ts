"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Note } from "@/lib/types";

export function useNotes(projectId: string, taskId?: string) {
  return useQuery({
    queryKey: queryKeys.notes(projectId, taskId),
    queryFn: () => api.get<Note[]>(`/projects/${projectId}/notes${taskId ? `?taskId=${taskId}` : ""}`),
    enabled: !!projectId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: ["notes", projectId] });
}

export function useCreateNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<Note>(`/projects/${projectId}/notes`, input),
    onSuccess: () => invalidate(qc, projectId),
  });
}

export function useUpdateNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) => api.patch<Note>(`/notes/${id}`, input),
    onSuccess: () => invalidate(qc, projectId),
  });
}

export function useDeleteNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/notes/${id}`),
    onSuccess: () => invalidate(qc, projectId),
  });
}
