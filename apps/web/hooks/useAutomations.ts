"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Automation, AutomationRun, WebhookStatus } from "@/lib/types";

export interface AutomationFilters {
  projectId?: string;
  trigger?: string;
  enabled?: string;
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

export function useAutomations(filters: AutomationFilters = {}) {
  return useQuery({
    queryKey: queryKeys.automations(filters),
    queryFn: () => api.get<Automation[]>(`/automations${toQueryString(filters)}`),
  });
}

export function useAutomationRuns(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: queryKeys.automationRuns(filters),
    // Unlike /automations, the run history endpoint is paginated:
    // { rows, total, page, pageSize }.
    queryFn: async () =>
      (await api.get<{ rows: AutomationRun[] }>(`/automation-runs${toQueryString(filters)}`)).rows ?? [],
  });
}

export function useWebhookStatus() {
  return useQuery({
    queryKey: queryKeys.webhookStatus,
    queryFn: () => api.get<WebhookStatus>("/automations/webhook-status"),
  });
}

export function useSimulateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AutomationRun>(`/automations/${id}/simulate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      qc.invalidateQueries({ queryKey: ["automation-runs"] });
    },
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      api.patch<Automation>(`/automations/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
  });
}

export function useRetryAutomationRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AutomationRun>(`/automation-runs/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-runs"] }),
  });
}
