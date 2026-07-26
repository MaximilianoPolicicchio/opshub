import type { Task } from "./types";

export interface TaskGroups {
  overdue: Task[];
  dueToday: Task[];
  inProgress: Task[];
  nextUp: Task[];
}

/**
 * Buckets the actionable-task set returned by GET /tasks/today into the
 * sections the Today view wants. The API returns the flat actionable list
 * without an attached "reason" field, so grouping is derived client-side
 * from each task's own dueDate/status — same signals the server used to
 * decide actionability (PROJECT_PLAN.md §2.8d), just not persisted per-task.
 * Priority order mirrors the server's own sort: overdue, then due today,
 * then already-in-progress, then the "what's next" backfill.
 */
export function groupActionableTasks(tasks: Task[]): TaskGroups {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);

  const groups: TaskGroups = { overdue: [], dueToday: [], inProgress: [], nextUp: [] };
  const seen = new Set<string>();

  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    const due = task.dueDate ? new Date(task.dueDate) : null;

    if (due && due.getTime() < startOfToday.getTime()) {
      groups.overdue.push(task);
      seen.add(task.id);
    } else if (due && due.getTime() <= endOfToday.getTime()) {
      groups.dueToday.push(task);
      seen.add(task.id);
    } else if (task.status === "IN_PROGRESS") {
      groups.inProgress.push(task);
      seen.add(task.id);
    } else {
      groups.nextUp.push(task);
      seen.add(task.id);
    }
  }

  return groups;
}
