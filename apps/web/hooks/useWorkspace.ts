"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useWorkspaceId } from "./useDashboard";
import type { Workspace, User } from "@/lib/types";

export function useWorkspace() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: queryKeys.workspace(workspaceId ?? ""),
    queryFn: () => api.get<Workspace>(`/workspaces/${workspaceId}`),
    enabled: !!workspaceId,
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.patch<Workspace>(`/workspaces/${workspaceId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; timezone?: string }) => api.patch<User>("/auth/me", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => api.post("/auth/change-password", input),
  });
}
