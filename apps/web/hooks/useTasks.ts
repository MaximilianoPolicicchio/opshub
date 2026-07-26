"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Task, TodayResponse } from "@/lib/types";

export interface TaskFilters {
  projectId?: string;
  status?: string;
  priority?: string;
  category?: string;
  tag?: string;
  blocked?: string;
  q?: string;
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

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks(filters),
    queryFn: () => api.get<Task[]>(`/tasks${toQueryString(filters)}`),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: queryKeys.task(id),
    queryFn: () => api.get<Task>(`/tasks/${id}`),
    enabled: !!id,
  });
}

export function useTasksToday() {
  return useQuery({
    queryKey: queryKeys.tasksToday,
    queryFn: () => api.get<TodayResponse>("/tasks/today"),
  });
}

function invalidateTaskLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["projects"] });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<Task>("/tasks", input),
    onSuccess: () => invalidateTaskLists(qc),
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.patch<Task>(`/tasks/${id}`, input),
    onSuccess: () => {
      invalidateTaskLists(qc);
      qc.invalidateQueries({ queryKey: queryKeys.task(id) });
    },
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch<Task>(`/tasks/${id}/status`, { status }),
    onSuccess: () => invalidateTaskLists(qc),
  });
}

export function useUpdateTaskPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, sortOrder }: { id: string; status: string; sortOrder: number }) =>
      api.patch<Task>(`/tasks/${id}/position`, { status, sortOrder }),
    onSuccess: () => invalidateTaskLists(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tasks/${id}`),
    onSuccess: () => invalidateTaskLists(qc),
  });
}

export function useSurfaceTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => api.post<Task>(`/tasks/${id}/surface`, { date }),
    onSuccess: () => invalidateTaskLists(qc),
  });
}

export function useAddDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dependsOnTaskId }: { id: string; dependsOnTaskId: string }) =>
      api.post(`/tasks/${id}/dependencies`, { dependsOnTaskId }),
    onSuccess: (_d, vars) => {
      invalidateTaskLists(qc);
      qc.invalidateQueries({ queryKey: queryKeys.task(vars.id) });
    },
  });
}

export function useRemoveDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, depId }: { id: string; depId: string }) => api.delete(`/tasks/${id}/dependencies/${depId}`),
    onSuccess: (_d, vars) => {
      invalidateTaskLists(qc);
      qc.invalidateQueries({ queryKey: queryKeys.task(vars.id) });
    },
  });
}
