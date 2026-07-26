"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { TaskStatus } from "@opshub/contracts";
import { useTasks, useUpdateTaskPosition } from "@/hooks/useTasks";
import { ApiError } from "@/lib/api-client";
import { Badge, priorityTone } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatDueLabel, isOverdue, titleCase } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/types";

const COLUMN_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  NEXT: "Next",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  REVIEW: "Review",
  DONE: "Done",
};

export default function ProjectBoardPage() {
  const { id } = useParams<{ id: string }>();
  const tasks = useTasks({ projectId: id });
  const updatePosition = useUpdateTaskPosition();
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (tasks.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {TaskStatus.map((s) => (
          <Skeleton key={s} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.isError) {
    return <ErrorState onRetry={() => tasks.refetch()} />;
  }

  const all = tasks.data ?? [];
  const byStatus: Record<string, Task[]> = {};
  for (const s of TaskStatus) byStatus[s] = [];
  for (const t of all) {
    (byStatus[t.status] ??= []).push(t);
  }
  function columnTasks(status: string): Task[] {
    return byStatus[status] ?? [];
  }

  async function handleDrop(status: string) {
    setDragOverStatus(null);
    const taskId = dragTaskId;
    setDragTaskId(null);
    if (!taskId) return;
    const task = all.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    setError(null);
    const sortOrder = byStatus[status]?.length ?? 0;
    try {
      await updatePosition.mutateAsync({ id: taskId, status, sortOrder });
    } catch (err) {
      if (err instanceof ApiError && err.code === "TASK_BLOCKED_BY_DEPENDENCY") {
        setError(`"${task.title}" can't move to ${COLUMN_LABELS[status]} — it's blocked by an incomplete dependency.`);
      } else {
        setError("Could not move the task. Please try again.");
      }
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-health-blocked/30 bg-health-blocked/10 px-3 py-2 text-sm text-health-blocked">
          <span>{error}</span>
          <button className="focus-ring rounded px-1 text-xs underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {TaskStatus.map((status) => (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(status);
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(status);
            }}
            className={cn(
              "flex min-h-[200px] flex-col gap-2 rounded-lg border border-border bg-surface p-2",
              dragOverStatus === status && "border-accent bg-accent/5",
            )}
          >
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{COLUMN_LABELS[status]}</span>
              <span className="text-xs text-ink-faint">{columnTasks(status).length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              {columnTasks(status).map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDragTaskId(task.id)}
                  onDragEnd={() => setDragTaskId(null)}
                  className={cn(
                    "cursor-grab rounded-md border border-border-subtle bg-surface-raised p-2.5 active:cursor-grabbing",
                    dragTaskId === task.id && "opacity-40",
                  )}
                >
                  <p className="text-sm text-ink">{task.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={priorityTone(task.priority)}>{titleCase(task.priority)}</Badge>
                    {task.isBlocked ? (
                      <Badge tone="blocked" dot>
                        Blocked
                      </Badge>
                    ) : null}
                    {task.dueDate ? (
                      <span className={cn("text-xs", isOverdue(task.dueDate) && task.status !== "DONE" ? "font-medium text-health-blocked" : "text-ink-faint")}>
                        {formatDueLabel(task.dueDate)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              {columnTasks(status).length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-ink-faint">No tasks</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
