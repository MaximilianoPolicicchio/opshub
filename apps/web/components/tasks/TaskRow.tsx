"use client";

import Link from "next/link";
import { Badge, priorityTone } from "@/components/ui/Badge";
import { formatDueLabel, isOverdue, titleCase } from "@/lib/formatters";
import { useUpdateTaskStatus } from "@/hooks/useTasks";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/types";

export function TaskRow({
  task,
  showProjectLink,
  projectName,
}: {
  task: Task;
  showProjectLink?: string;
  projectName?: string;
}) {
  const updateStatus = useUpdateTaskStatus();
  const overdue = isOverdue(task.dueDate) && task.status !== "DONE";
  const dueLabel = formatDueLabel(task.dueDate);

  function toggleDone() {
    updateStatus.mutate({ id: task.id, status: task.status === "DONE" ? "NEXT" : "DONE" });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-surface-hover/60",
        task.status === "DONE" && "opacity-50",
      )}
    >
      <button
        role="checkbox"
        aria-checked={task.status === "DONE"}
        aria-label={task.status === "DONE" ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        onClick={toggleDone}
        className={cn(
          "focus-ring flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border",
          task.status === "DONE" ? "border-accent bg-accent" : "border-border-DEFAULT hover:border-accent",
        )}
        style={{ height: 18, width: 18 }}
      >
        {task.status === "DONE" ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6.5 5 9l5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm text-ink", task.status === "DONE" && "line-through")}>{task.title}</span>
          {task.isBlocked ? (
            <Badge tone="blocked" dot>
              Blocked
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
          {showProjectLink && projectName ? (
            <Link href={`/projects/${showProjectLink}`} className="hover:text-ink-muted hover:underline">
              {projectName}
            </Link>
          ) : null}
          <span>{titleCase(task.category)}</span>
          {dueLabel ? <span className={overdue ? "font-medium text-health-blocked" : ""}>{dueLabel}</span> : null}
        </div>
      </div>

      <Badge tone={priorityTone(task.priority)}>{titleCase(task.priority)}</Badge>
    </div>
  );
}
