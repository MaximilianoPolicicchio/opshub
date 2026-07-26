"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { BudgetWithBurn, BudgetAlert, FinancialOverview } from "@/lib/types";

export function useBudget(projectId: string) {
  return useQuery({
    queryKey: queryKeys.budget(projectId),
    queryFn: () => api.get<BudgetWithBurn | null>(`/projects/${projectId}/budget`),
    enabled: !!projectId,
  });
}

export function useBudgetAlerts(projectId: string) {
  return useQuery({
    queryKey: queryKeys.budgetAlerts(projectId),
    queryFn: () => api.get<BudgetAlert[]>(`/projects/${projectId}/budget/alerts`),
    enabled: !!projectId,
  });
}

export function useUpsertBudget(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.put(`/projects/${projectId}/budget`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.budget(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      qc.invalidateQueries({ queryKey: ["financial-overview"] });
    },
  });
}

export function useAcknowledgeAlert(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => api.post(`/budget-alerts/${alertId}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budgetAlerts(projectId) }),
  });
}

export function useFinancialOverview(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.financialOverview(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      const s = qs.toString();
      return api.get<FinancialOverview>(`/financial/overview${s ? `?${s}` : ""}`);
    },
  });
}
