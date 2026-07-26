"use client";

import { useParams } from "next/navigation";
import { useTimeEntries } from "@/hooks/useTimeEntries";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatDateTime, formatDuration } from "@/lib/formatters";

export default function ProjectTimePage() {
  const { id } = useParams<{ id: string }>();
  const entries = useTimeEntries({ projectId: id });

  const totalMinutes = (entries.data ?? []).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  if (entries.isLoading) {
    return (
      <Card>
        <CardBody>
          <SkeletonList rows={6} />
        </CardBody>
      </Card>
    );
  }

  if (entries.isError) {
    return <ErrorState onRetry={() => entries.refetch()} />;
  }

  if ((entries.data?.length ?? 0) === 0) {
    return <EmptyState title="No time logged yet" description="Time entries tracked for this project will appear here." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          Total tracked: <span className="font-medium text-ink">{formatDuration(totalMinutes)}</span>
        </p>
      </div>
      <Card>
        <Table>
          <Thead>
            <Tr>
              <Th>Started</Th>
              <Th>Task</Th>
              <Th>Description</Th>
              <Th>Duration</Th>
              <Th>Billable</Th>
            </Tr>
          </Thead>
          <Tbody>
            {entries.data!.map((e) => (
              <Tr key={e.id}>
                <Td>{formatDateTime(e.startTime)}</Td>
                <Td>{e.task?.title ?? <span className="text-ink-faint">—</span>}</Td>
                <Td className="max-w-xs truncate">{e.description ?? <span className="text-ink-faint">—</span>}</Td>
                <Td>{e.endTime ? formatDuration(e.durationMinutes) : <Badge tone="info">Running</Badge>}</Td>
                <Td>{e.billable ? <Badge tone="healthy">Billable</Badge> : <Badge tone="neutral">Non-billable</Badge>}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>
    </div>
  );
}
