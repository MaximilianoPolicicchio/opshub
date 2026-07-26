"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useProjectOverview } from "@/hooks/useProjects";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatHours, formatPercent, titleCase, timeAgo } from "@/lib/formatters";

const STATUS_ORDER = ["BACKLOG", "NEXT", "IN_PROGRESS", "WAITING", "REVIEW", "DONE"];

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const overview = useProjectOverview(id);

  if (overview.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 w-full lg:col-span-2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (overview.isError || !overview.data) {
    return <ErrorState message="Could not load the project overview." onRetry={() => overview.refetch()} />;
  }

  const { countsByStatus, milestoneProgress, recentActivity, hoursThisWeek, project } = overview.data;
  const total = countsByStatus.reduce((sum, c) => sum + c._count, 0);
  const countMap = new Map(countsByStatus.map((c) => [c.status, c._count]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Tasks by status</CardTitle>
            <span className="text-xs text-ink-faint">{total} total</span>
          </CardHeader>
          <CardBody>
            {total === 0 ? (
              <p className="text-sm text-ink-faint">No tasks yet.</p>
            ) : (
              <div className="space-y-2.5">
                {STATUS_ORDER.map((status) => {
                  const count = countMap.get(status as never) ?? 0;
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs text-ink-muted">{titleCase(status)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-faint">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <Link href={`/projects/${id}/activity`} className="text-xs text-accent hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardBody className="space-y-3">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-ink-faint">No recent activity.</p>
            ) : (
              recentActivity.map((event) => (
                <div key={event.id} className="text-sm">
                  <p className="text-ink-muted">{event.summary}</p>
                  <p className="text-xs text-ink-faint">{timeAgo(event.createdAt)}</p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Milestone progress</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, milestoneProgress)}%` }} />
              </div>
              <span className="text-sm font-medium tabular-nums text-ink">{formatPercent(milestoneProgress)}</span>
            </div>
            <Link href={`/projects/${id}/milestones`} className="mt-2 inline-block text-xs text-accent hover:underline">
              View milestones
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hours this week</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-2xl font-semibold tabular-nums text-ink">{formatHours(hoursThisWeek)}</p>
            <Link href={`/projects/${id}/time`} className="mt-2 inline-block text-xs text-accent hover:underline">
              View time entries
            </Link>
          </CardBody>
        </Card>

        {project.budget ? (
          <Card>
            <CardHeader>
              <CardTitle>Budget</CardTitle>
              <Badge tone="neutral">{titleCase(project.budget.billingModel)}</Badge>
            </CardHeader>
            <CardBody className="space-y-1.5">
              <p className="text-sm text-ink-muted">
                Estimated: <span className="font-medium text-ink">{formatHours(project.budget.estimatedHours)}</span>
              </p>
              <Link href={`/projects/${id}/budget`} className="inline-block text-xs text-accent hover:underline">
                View budget details
              </Link>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
