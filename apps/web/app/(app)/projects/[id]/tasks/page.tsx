"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { TaskStatus, Priority, TaskCategory } from "@opshub/contracts";
import { useTasks } from "@/hooks/useTasks";
import { TaskRow } from "@/components/tasks/TaskRow";
import { QuickAddTaskDialog } from "@/components/tasks/QuickAddTaskDialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { titleCase } from "@/lib/formatters";

export default function ProjectTasksPage() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const tasks = useTasks({
    projectId: id,
    status: status || undefined,
    priority: priority || undefined,
    category: category || undefined,
    q: q || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} className="w-52" aria-label="Search tasks" />
          <Select className="w-36" placeholder="All statuses" value={status} onChange={(e) => setStatus(e.target.value)}>
            {TaskStatus.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
          <Select className="w-36" placeholder="All priorities" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Priority.map((p) => (
              <option key={p} value={p}>
                {titleCase(p)}
              </option>
            ))}
          </Select>
          <Select className="w-40" placeholder="All categories" value={category} onChange={(e) => setCategory(e.target.value)}>
            {TaskCategory.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          Add task
        </Button>
      </div>

      {tasks.isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={6} />
          </CardBody>
        </Card>
      ) : tasks.isError ? (
        <ErrorState onRetry={() => tasks.refetch()} />
      ) : (tasks.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No tasks match these filters"
          description="Try clearing filters, or add the first task for this project."
          action={
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              Add task
            </Button>
          }
        />
      ) : (
        <Card>
          <CardBody className="space-y-0.5">
            {tasks.data!.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </CardBody>
        </Card>
      )}

      <QuickAddTaskDialog open={addOpen} onClose={() => setAddOpen(false)} defaultProjectId={id} />
    </div>
  );
}
