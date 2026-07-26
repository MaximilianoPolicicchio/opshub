"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMe } from "./useMe";
import type { DashboardResponse, ActivityEvent } from "@/lib/types";

export function useWorkspaceId(): string | undefined {
  const { data: me } = useMe();
  return me?.memberships?.[0]?.workspaceId;
}

export function useDashboard() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: queryKeys.dashboard(workspaceId ?? ""),
    queryFn: () => api.get<DashboardResponse>(`/workspaces/${workspaceId}/dashboard`),
    enabled: !!workspaceId,
  });
}

export function useWorkspaceActivity(limit = 15) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: queryKeys.workspaceActivity(workspaceId ?? ""),
    queryFn: async () => {
      // The activity endpoint is paginated: { rows, total, page, pageSize }.
      const res = await api.get<{ rows: ActivityEvent[] }>(
        `/workspaces/${workspaceId}/activity`,
      );
      return (res.rows ?? []).slice(0, limit);
    },
    enabled: !!workspaceId,
  });
}
