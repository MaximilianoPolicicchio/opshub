"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MilestoneStatus } from "@opshub/contracts";
import { useMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone } from "@/hooks/useMilestones";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label, Textarea, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatDate, titleCase } from "@/lib/formatters";
import type { Milestone } from "@/lib/types";

function statusTone(status: string) {
  if (status === "DONE") return "healthy" as const;
  if (status === "CANCELLED") return "neutral" as const;
  if (status === "IN_PROGRESS") return "info" as const;
  return "neutral" as const;
}

export default function ProjectMilestonesPage() {
  const { id } = useParams<{ id: string }>();
  const milestones = useMilestones(id);
  const createMilestone = useCreateMilestone(id);
  const updateMilestone = useUpdateMilestone(id);
  const deleteMilestone = useDeleteMilestone(id);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState("PLANNED");

  function openCreate() {
    setEditing(null);
    setTitle("");
    setDescription("");
    setTargetDate("");
    setStatus("PLANNED");
    setDialogOpen(true);
  }

  function openEdit(m: Milestone) {
    setEditing(m);
    setTitle(m.title);
    setDescription(m.description ?? "");
    setTargetDate(m.targetDate ? m.targetDate.slice(0, 10) : "");
    setStatus(m.status);
    setDialogOpen(true);
  }

  async function onSubmit() {
    if (!title.trim()) return;
    const input = {
      title: title.trim(),
      description: description || null,
      targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      status,
    };
    if (editing) {
      await updateMilestone.mutateAsync({ id: editing.id, input });
    } else {
      await createMilestone.mutateAsync(input);
    }
    setDialogOpen(false);
  }

  const isPending = createMilestone.isPending || updateMilestone.isPending;
  const isError = createMilestone.isError || updateMilestone.isError;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="primary" onClick={openCreate}>
          New milestone
        </Button>
      </div>

      {milestones.isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={4} />
          </CardBody>
        </Card>
      ) : milestones.isError ? (
        <ErrorState onRetry={() => milestones.refetch()} />
      ) : (milestones.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No milestones yet"
          description="Break this project into milestones to track progress toward key dates."
          action={
            <Button variant="primary" size="sm" onClick={openCreate}>
              New milestone
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {milestones.data!.map((m) => (
            <Card key={m.id}>
              <CardBody className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink">{m.title}</p>
                    <Badge tone={statusTone(m.status)}>{titleCase(m.status)}</Badge>
                  </div>
                  {m.description ? <p className="mt-1 text-sm text-ink-muted">{m.description}</p> : null}
                  <p className="mt-1.5 text-xs text-ink-faint">
                    {m.targetDate ? `Target: ${formatDate(m.targetDate)}` : "No target date"}
                    {m.completedAt ? ` · Completed ${formatDate(m.completedAt)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete milestone "${m.title}"?`)) deleteMilestone.mutate(m.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Edit milestone" : "New milestone"} size="sm">
        <div className="space-y-4">
          <div>
            <Label htmlFor="m-title">Title</Label>
            <Input id="m-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="m-desc">Description (optional)</Label>
            <Textarea id="m-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="m-date">Target date</Label>
              <Input id="m-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="m-status">Status</Label>
              <Select id="m-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {MilestoneStatus.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <FieldError>{isError ? "Could not save the milestone. Please try again." : null}</FieldError>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!title.trim()} loading={isPending} onClick={onSubmit}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
