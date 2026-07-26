import { Priority, ProjectStatus, TaskStatus } from "@opshub/contracts";

export interface ActionableTaskInput {
  archivedAt: Date | null;
  status: TaskStatus;
  isBlockedLive: boolean;
  dueDate: Date | null;
  surfacedForDate: Date | null;
  priority: Priority;
}

export interface ActionableProjectInput {
  status: ProjectStatus;
  archivedAt: Date | null;
}

/**
 * Pure implementation of the "actionable" predicate, PROJECT_PLAN.md §2.8d.
 * `today` should be the current date at midnight in the workspace timezone;
 * `endOfToday` the same day at 23:59:59.999.
 */
export function isTaskActionable(
  task: ActionableTaskInput,
  project: ActionableProjectInput,
  today: Date,
  endOfToday: Date,
): boolean {
  if (task.archivedAt !== null) return false;
  if (task.status === "DONE") return false;
  if (task.isBlockedLive) return false;
  if (!(project.status === "ACTIVE" || project.status === "MAINTENANCE")) return false;
  if (project.archivedAt !== null) return false;

  const dueTodayOrOverdue = task.dueDate !== null && task.dueDate.getTime() <= endOfToday.getTime();
  const inProgress = task.status === "IN_PROGRESS";
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const surfacedToday = task.surfacedForDate !== null && isSameDay(task.surfacedForDate, today);
  const nextHighPriority = task.status === "NEXT" && (task.priority === "CRITICAL" || task.priority === "HIGH");

  return dueTodayOrOverdue || inProgress || surfacedToday || nextHighPriority;
}

export type ActionableReason = "due_or_overdue" | "in_progress" | "surfaced" | "next_backfill";

/**
 * Which clause of isTaskActionable made this task actionable. Used so the
 * NEXT+HIGH/CRITICAL backfill cap (5 items) only applies to tasks that are
 * *only* actionable because of that clause, not to a NEXT task that also
 * happens to be overdue.
 */
export function classifyActionableReason(
  task: ActionableTaskInput,
  today: Date,
  endOfToday: Date,
): ActionableReason | null {
  const dueTodayOrOverdue = task.dueDate !== null && task.dueDate.getTime() <= endOfToday.getTime();
  if (dueTodayOrOverdue) return "due_or_overdue";
  if (task.status === "IN_PROGRESS") return "in_progress";
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (task.surfacedForDate !== null && isSameDay(task.surfacedForDate, today)) return "surfaced";
  if (task.status === "NEXT" && (task.priority === "CRITICAL" || task.priority === "HIGH")) return "next_backfill";
  return null;
}

const PRIORITY_ORDER: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export interface SortableActionableTask {
  id: string;
  dueDate: Date | null;
  priority: Priority;
  sortOrder: number;
  status: TaskStatus;
}

/** Ordering: overdue first, then Critical -> Low, then earliest dueDate, then sortOrder. */
export function compareActionableTasks(a: SortableActionableTask, b: SortableActionableTask, endOfToday: Date): number {
  const aOverdue = a.dueDate !== null && a.dueDate.getTime() <= endOfToday.getTime() ? 0 : 1;
  const bOverdue = b.dueDate !== null && b.dueDate.getTime() <= endOfToday.getTime() ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;

  const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (pDiff !== 0) return pDiff;

  const aDue = a.dueDate?.getTime() ?? Infinity;
  const bDue = b.dueDate?.getTime() ?? Infinity;
  if (aDue !== bDue) return aDue - bDue;

  return a.sortOrder - b.sortOrder;
}

/** Caps the "next_backfill"-reason bucket at 5 items so Today never becomes a dump. */
export function capNextPriorityBackfill<T extends { reason: ActionableReason | null }>(tasks: T[], max = 5): T[] {
  let count = 0;
  return tasks.filter((t) => {
    if (t.reason !== "next_backfill") return true;
    count++;
    return count <= max;
  });
}
