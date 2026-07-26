import { ProjectHealth, ProjectStatus } from "@opshub/contracts";

export interface HealthEvalCounts {
  /** count(tasks where HIGH and open and isBlocked) */
  highPriorityBlockedOpen: number;
  /** count(tasks where HIGH and status = WAITING and updatedAt < now - 7 days) */
  highPriorityWaitingStale: number;
  /** count(tasks where HIGH and open and dueDate < today) */
  highPriorityOverdue: number;
  /** count(tasks where open and dueDate < today) -- any priority */
  overdueOpen: number;
}

export interface HealthEvalInput {
  status: ProjectStatus;
  counts: HealthEvalCounts;
  /** burnPercent, or null if there is no budget */
  budgetBurnPercent: number | null;
  lastActivityAt: Date;
  now: Date;
}

export interface HealthEvalResult {
  health: ProjectHealth;
  reason: string;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Pure implementation of PROJECT_PLAN.md §2.8e. First match wins; deterministic;
 * no DB access so it is directly unit-testable.
 */
export function evaluateProjectHealth(input: HealthEvalInput): HealthEvalResult {
  if (input.status === "PAUSED" || input.status === "ARCHIVED") {
    return { health: "HEALTHY", reason: "Project is paused or archived." };
  }

  const { counts } = input;

  if (counts.highPriorityBlockedOpen >= 1) {
    return {
      health: "BLOCKED",
      reason: `${counts.highPriorityBlockedOpen} high-priority task(s) blocked by an open dependency`,
    };
  }
  if (counts.highPriorityWaitingStale >= 1) {
    return {
      health: "BLOCKED",
      reason: `${counts.highPriorityWaitingStale} high-priority task(s) waiting for over 7 days`,
    };
  }

  if (counts.highPriorityOverdue >= 1) {
    return { health: "NEEDS_ATTENTION", reason: `${counts.highPriorityOverdue} high-priority task(s) overdue` };
  }
  if (counts.overdueOpen >= 3) {
    return { health: "NEEDS_ATTENTION", reason: `${counts.overdueOpen} open tasks overdue` };
  }
  if (input.budgetBurnPercent !== null && input.budgetBurnPercent >= 90) {
    return { health: "NEEDS_ATTENTION", reason: `Budget burn at ${input.budgetBurnPercent.toFixed(0)}%` };
  }
  if (input.status === "ACTIVE" && input.now.getTime() - input.lastActivityAt.getTime() >= FOURTEEN_DAYS_MS) {
    return { health: "NEEDS_ATTENTION", reason: "No activity in the last 14 days" };
  }

  return { health: "HEALTHY", reason: "No risk signals detected" };
}
