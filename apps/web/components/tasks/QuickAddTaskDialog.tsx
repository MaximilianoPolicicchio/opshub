"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TaskCategory, TaskStatus, Priority } from "@opshub/contracts";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useCreateTask } from "@/hooks/useTasks";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { titleCase } from "@/lib/formatters";
import type { Project } from "@/lib/types";

export function QuickAddTaskDialog({
  open,
  onClose,
  defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [category, setCategory] = useState<string>("FEATURE");
  const [status, setStatus] = useState<string>("NEXT");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects({ status: "ACTIVE" }),
    queryFn: () => api.get<{ rows: Project[] }>("/projects?status=ACTIVE"),
    enabled: open && !defaultProjectId,
  });

  const createTask = useCreateTask();

  function reset() {
    setTitle("");
    setPriority("MEDIUM");
    setCategory("FEATURE");
    setStatus("NEXT");
    setDueDate("");
    setDescription("");
    if (!defaultProjectId) setProjectId("");
  }

  async function onSubmit() {
    if (!title.trim() || !projectId) return;
    await createTask.mutateAsync({
      projectId,
      title: title.trim(),
      description: description || null,
      priority,
      category,
      status,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    });
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Quick add task" size="sm">
      <div className="space-y-4">
        <div>
          <Label htmlFor="qa-title">Title</Label>
          <Input id="qa-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="What needs doing?" />
        </div>
        {!defaultProjectId ? (
          <div>
            <Label htmlFor="qa-project">Project</Label>
            <Select id="qa-project" placeholder="Select a project…" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projectsQuery.data?.rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="qa-priority">Priority</Label>
            <Select id="qa-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Priority.map((p) => (
                <option key={p} value={p}>
                  {titleCase(p)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="qa-status">Status</Label>
            <Select id="qa-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {TaskStatus.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="qa-category">Category</Label>
            <Select id="qa-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {TaskCategory.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="qa-due">Due date</Label>
            <Input id="qa-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="qa-desc">Notes (optional)</Label>
          <Textarea id="qa-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <FieldError>{createTask.isError ? "Could not create the task. Please try again." : null}</FieldError>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!title.trim() || !projectId} loading={createTask.isPending} onClick={onSubmit}>
            Add task
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
