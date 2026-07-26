"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Project, ProjectListResult, ProjectOverview, ProjectTemplate, ActivityEvent } from "@/lib/types";

export interface ProjectFilters {
  status?: string;
  health?: string;
  type?: string;
  priority?: string;
  tag?: string;
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

export function useProjects(filters: ProjectFilters = {}) {
  return useQuery({
    queryKey: queryKeys.projects(filters),
    queryFn: () => api.get<ProjectListResult>(`/projects${toQueryString(filters)}`),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => api.get<Project>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useProjectOverview(id: string) {
  return useQuery({
    queryKey: queryKeys.projectOverview(id),
    queryFn: () => api.get<ProjectOverview>(`/projects/${id}/overview`),
    enabled: !!id,
  });
}

export function useProjectActivity(id: string) {
  return useQuery({
    queryKey: queryKeys.projectActivity(id),
    // The activity endpoint is paginated: { rows, total, page, pageSize }.
    queryFn: async () =>
      (await api.get<{ rows: ActivityEvent[] }>(`/projects/${id}/activity`)).rows ?? [],
    enabled: !!id,
  });
}

export function useProjectTemplates() {
  return useQuery({
    queryKey: queryKeys.projectTemplates,
    queryFn: () => api.get<ProjectTemplate[]>("/project-templates"),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<Project>("/projects", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.patch<Project>(`/projects/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: queryKeys.project(id) });
      qc.invalidateQueries({ queryKey: queryKeys.projectOverview(id) });
    },
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Project>(`/projects/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useRestoreProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Project>(`/projects/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
