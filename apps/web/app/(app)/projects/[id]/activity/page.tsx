"use client";

import { useParams } from "next/navigation";
import { useProjectActivity } from "@/hooks/useProjects";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatDateTime, titleCase } from "@/lib/formatters";

export default function ProjectActivityPage() {
  const { id } = useParams<{ id: string }>();
  const activity = useProjectActivity(id);

  if (activity.isLoading) {
    return (
      <Card>
        <CardBody>
          <SkeletonList rows={8} />
        </CardBody>
      </Card>
    );
  }

  if (activity.isError) {
    return <ErrorState onRetry={() => activity.refetch()} />;
  }

  if ((activity.data?.length ?? 0) === 0) {
    return <EmptyState title="No activity yet" description="Actions taken on this project will show up here." />;
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        {activity.data!.map((event) => (
          <div key={event.id} className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3 last:border-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm text-ink">{event.summary}</p>
              <p className="mt-0.5 text-xs text-ink-faint">{formatDateTime(event.createdAt)}</p>
            </div>
            <Badge tone="neutral" className="shrink-0">
              {titleCase(event.type)}
            </Badge>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
