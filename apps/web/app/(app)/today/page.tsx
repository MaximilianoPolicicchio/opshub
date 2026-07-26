"use client";

import { useState } from "react";
import Link from "next/link";
import { useDashboard, useWorkspaceActivity } from "@/hooks/useDashboard";
import { useTasksToday } from "@/hooks/useTasks";
import { groupActionableTasks } from "@/lib/task-grouping";
import { TaskRow } from "@/components/tasks/TaskRow";
import { QuickAddTaskDialog } from "@/components/tasks/QuickAddTaskDialog";
import { QuickStartTimerDialog } from "@/components/time/QuickStartTimerDialog";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, healthTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList, Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatHours, timeAgo, titleCase } from "@/lib/formatters";
import type { Task } from "@/lib/types";

export default function TodayPage() {
  const dashboard = useDashboard();
  const today = useTasksToday();
  const activity = useWorkspaceActivity(8);
  const [addOpen, setAddOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [waitingOpen, setWaitingOpen] = useState(false);

  const isLoading = dashboard.isLoading || today.isLoading;
  const isError = dashboard.isError || today.isError;

  if (isError) {
    return (
      <ErrorState
        message="Could not load your Today view."
        onRetry={() => {
          dashboard.refetch();
          today.refetch();
        }}
      />
    );
  }

  const actionable = today.data?.actionable ?? [];
  const waiting = today.data?.waiting ?? [];
  const blocked = actionable.filter((t) => t.isBlocked);
  const groups = groupActionableTasks(actionable.filter((t) => !t.isBlocked));
  const projectsNeedingAttention = dashboard.data?.projectsNeedingAttention ?? [];
  const todaysHours = dashboard.data?.todaysHours ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Today</h1>
          <p className="text-sm text-ink-muted">
            {isLoading ? "Loading…" : `${actionable.length} actionable task${actionable.length === 1 ? "" : "s"} · ${formatHours(todaysHours)} tracked today`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setTimerOpen(true)}>
            Quick start timer
          </Button>
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            Quick add task
          </Button>
        </div>
      </div>

      {projectsNeedingAttention.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {projectsNeedingAttention.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Badge tone={healthTone(p.health)} dot>
                {p.name} · {titleCase(p.health)}
              </Badge>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {isLoading ? (
            <Card>
              <CardBody>
                <SkeletonList rows={5} />
              </CardBody>
            </Card>
          ) : (
            <>
              <TaskSection title="Overdue" tone="blocked" tasks={groups.overdue} />
              <TaskSection title="Due today" tone="attention" tasks={groups.dueToday} />
              <TaskSection title="In progress" tone="info" tasks={groups.inProgress} />
              <TaskSection title="Next up" tone="neutral" tasks={groups.nextUp} />

              {blocked.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Blocked ({blocked.length})</CardTitle>
                  </CardHeader>
                  <CardBody className="space-y-0.5">
                    {blocked.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </CardBody>
                </Card>
              ) : null}

              {actionable.length === 0 && (
                <EmptyState
                  title="Nothing actionable right now"
                  description="You're all caught up. Add a task or check your project boards for what's next."
                  action={
                    <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                      Quick add task
                    </Button>
                  }
                />
              )}

              {waiting.length > 0 ? (
                <Card>
                  <CardHeader className="cursor-pointer select-none" onClick={() => setWaitingOpen((v) => !v)}>
                    <CardTitle>Waiting on ({waiting.length})</CardTitle>
                    <span className="text-xs text-ink-faint">{waitingOpen ? "Hide" : "Show"}</span>
                  </CardHeader>
                  {waitingOpen ? (
                    <CardBody className="space-y-0.5">
                      {waiting.map((t) => (
                        <TaskRow key={t.id} task={t} />
                      ))}
                    </CardBody>
                  ) : null}
                </Card>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {activity.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (activity.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-ink-faint">No activity yet.</p>
              ) : (
                activity.data!.map((event) => (
                  <div key={event.id} className="text-sm">
                    <p className="text-ink-muted">{event.summary}</p>
                    <p className="text-xs text-ink-faint">{timeAgo(event.createdAt)}</p>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <QuickAddTaskDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <QuickStartTimerDialog open={timerOpen} onClose={() => setTimerOpen(false)} />
    </div>
  );
}

function TaskSection({
  title,
  tone,
  tasks,
}: {
  title: string;
  tone: "blocked" | "attention" | "info" | "neutral";
  tasks: Task[];
}) {
  if (tasks.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} <span className="ml-1 font-normal text-ink-faint">({tasks.length})</span>
        </CardTitle>
        <Badge tone={tone}>{title}</Badge>
      </CardHeader>
      <CardBody className="space-y-0.5">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </CardBody>
    </Card>
  );
}
