"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Vendor, Subscription, Expense, MonthlyCostSummary } from "@/lib/types";

/**
 * Every cost list endpoint returns a bare array, not `{ rows }`. Getting that
 * wrong renders an empty screen with no error, which has already happened four
 * times in this codebase — see docs/architecture.md.
 */

function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) search.set(k, v);
  });
  const s = search.toString();
  return s ? `?${s}` : "";
}

/** Anything that changes money invalidates the summary and the review queue. */
function invalidateCosts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["cost-expenses"] });
  qc.invalidateQueries({ queryKey: ["cost-subscriptions"] });
  qc.invalidateQueries({ queryKey: ["cost-summary"] });
  qc.invalidateQueries({ queryKey: ["cost-vendors"] });
}

// ------------------------------------------------------------------ vendors

export function useVendors() {
  return useQuery({
    queryKey: queryKeys.costVendors(),
    queryFn: () => api.get<Vendor[]>("/costs/vendors"),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<Vendor>("/costs/vendors", input),
    onSuccess: () => invalidateCosts(qc),
  });
}

export function useArchiveVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<Vendor>(`/costs/vendors/${id}`),
    onSuccess: () => invalidateCosts(qc),
  });
}

// ------------------------------------------------------------ subscriptions

export function useSubscriptions(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: queryKeys.costSubscriptions(filters),
    queryFn: () => api.get<Subscription[]>(`/costs/subscriptions${qs(filters)}`),
  });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<Subscription>("/costs/subscriptions", input),
    onSuccess: () => invalidateCosts(qc),
  });
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      api.patch<Subscription>(`/costs/subscriptions/${id}`, input),
    onSuccess: () => invalidateCosts(qc),
  });
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/costs/subscriptions/${id}`),
    onSuccess: () => invalidateCosts(qc),
  });
}

// ----------------------------------------------------------------- expenses

export function useExpenses(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: queryKeys.costExpenses(filters),
    queryFn: () => api.get<Expense[]>(`/costs/expenses${qs(filters)}`),
  });
}

export function usePendingReviewExpenses() {
  return useQuery({
    queryKey: queryKeys.costPendingReview(),
    queryFn: () => api.get<Expense[]>("/costs/expenses/pending-review"),
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<Expense>("/costs/expenses", input),
    onSuccess: () => invalidateCosts(qc),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      api.patch<Expense>(`/costs/expenses/${id}`, input),
    onSuccess: () => invalidateCosts(qc),
  });
}

/** Status changes are their own endpoint, so confirming is never accidental. */
export function useReviewExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "CONFIRMED" | "REJECTED" | "PAID" }) =>
      api.post<Expense>(`/costs/expenses/${id}/review`, { status }),
    onSuccess: () => invalidateCosts(qc),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/costs/expenses/${id}`),
    onSuccess: () => invalidateCosts(qc),
  });
}

// ------------------------------------------------------------------ summary

export function useCostSummary(month: string) {
  return useQuery({
    queryKey: queryKeys.costSummary(month),
    queryFn: () => api.get<MonthlyCostSummary>(`/costs/summary?month=${month}`),
    enabled: !!month,
  });
}
