"use client";

import Link from "next/link";
import { useWeeklyReview, useGenerateWeeklyReview } from "@/hooks/useWeeklyReview";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, healthTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate, formatHours, formatDueLabel, titleCase } from "@/lib/formatters";

export default function WeeklyReviewPage() {
  const review = useWeeklyReview();
  const generate = useGenerateWeeklyReview();

  async function onGenerate() {
    await generate.mutateAsync(undefined);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Weekly review</h1>
          {review.data ? (
            <p className="text-sm text-ink-muted">
              {formatDate(review.data.periodStart)} – {formatDate(review.data.periodEnd)}
            </p>
          ) : null}
        </div>
        <Button variant="primary" loading={generate.isPending} onClick={onGenerate}>
          {review.data ? "Regenerate" : "Generate review"}
        </Button>
      </div>

      {review.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : review.isError ? (
        <ErrorState onRetry={() => review.refetch()} />
      ) : !review.data ? (
        <EmptyState
          title="No weekly review yet"
          description="Generate a review to see what shipped, what's carrying over, and what's at risk."
          action={
            <Button variant="primary" size="sm" loading={generate.isPending} onClick={onGenerate}>
              Generate review
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Completed</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-2xl font-semibold tabular-nums text-ink">{review.data.tasksCompleted}</p>
              <p className="text-xs text-ink-faint">tasks completed this week</p>
              {review.data.tasksCompletedByProject.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {review.data.tasksCompletedByProject.map((p) => (
                    <div key={p.projectId} className="flex items-center justify-between text-sm">
                      <Link href={`/projects/${p.projectId}`} className="text-ink-muted hover:text-ink hover:underline">
                        {p.projectName}
                      </Link>
                      <span className="tabular-nums text-ink-faint">{p.count}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Time tracked</CardTitle>
            </CardHeader>
            <CardBody className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">{formatHours(review.data.hoursTracked)}</p>
                <p className="text-xs text-ink-faint">total</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">{formatHours(review.data.billableHours)}</p>
                <p className="text-xs text-ink-faint">billable</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Carryover &amp; blocked</CardTitle>
            </CardHeader>
            <CardBody className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">{review.data.overdueCarryOver}</p>
                <p className="text-xs text-ink-faint">overdue carrying over</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">{review.data.automationFailures}</p>
                <p className="text-xs text-ink-faint">automation failures</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Projects at risk</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              {review.data.projectsAtRisk.length === 0 ? (
                <p className="text-sm text-ink-faint">No projects at risk.</p>
              ) : (
                review.data.projectsAtRisk.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between text-sm hover:underline">
                    <span className="text-ink">{p.name}</span>
                    <Badge tone={healthTone(p.health)} dot>
                      {titleCase(p.health)}
                    </Badge>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Upcoming due</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5">
              {review.data.upcomingDue.length === 0 ? (
                <p className="text-sm text-ink-faint">Nothing due soon.</p>
              ) : (
                review.data.upcomingDue.map((t) => (
                  <div key={t.taskId} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{t.title}</span>
                    <span className="text-xs text-ink-faint">{formatDueLabel(t.dueDate)}</span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
