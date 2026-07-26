"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useStartTimer, isConflict409 } from "@/hooks/useTimer";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input, Label, FieldError } from "@/components/ui/Input";
import type { Project, Task } from "@/lib/types";

export function QuickStartTimerDialog({
  open,
  onClose,
  defaultProjectId,
  defaultTaskId,
}: {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  defaultTaskId?: string;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [taskId, setTaskId] = useState(defaultTaskId ?? "");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(false);
  const [conflictEntry, setConflictEntry] = useState<{ id: string } | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects({ status: "ACTIVE" }),
    queryFn: () => api.get<{ rows: Project[] }>("/projects?status=ACTIVE"),
    enabled: open,
  });

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks({ projectId }),
    queryFn: () => api.get<Task[]>(`/tasks?projectId=${projectId}`),
    enabled: open && !!projectId,
  });

  const startTimer = useStartTimer();

  async function handleStart(onConflict?: "stopPrevious") {
    if (!projectId) return;
    try {
      await startTimer.mutateAsync({
        projectId,
        taskId: taskId || null,
        description: description || null,
        billable,
        onConflict,
      });
      setConflictEntry(null);
      onClose();
    } catch (err) {
      if (isConflict409(err)) {
        const details = err.details as { id?: string } | undefined;
        setConflictEntry({ id: details?.id ?? "" });
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Start timer" size="sm">
      <div className="space-y-4">
        <div>
          <Label htmlFor="qs-project">Project</Label>
          <Select
            id="qs-project"
            placeholder="Select a project…"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTaskId("");
            }}
          >
            {projectsQuery.data?.rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="qs-task">Task (optional)</Label>
          <Select id="qs-task" placeholder="No specific task" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!projectId}>
            {tasksQuery.data
              ?.filter((t) => t.status !== "DONE")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="qs-desc">Description (optional)</Label>
          <Input id="qs-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Billable
        </label>

        {conflictEntry ? (
          <div className="rounded-md border border-health-attention/30 bg-health-attention/10 p-3 text-sm text-health-attention">
            You already have a timer running.{" "}
            <button className="underline" onClick={() => handleStart("stopPrevious")}>
              Stop it and start this one
            </button>
            .
          </div>
        ) : (
          <FieldError>{startTimer.isError && !conflictEntry ? "Could not start the timer. Please try again." : null}</FieldError>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!projectId} loading={startTimer.isPending} onClick={() => handleStart()}>
            Start timer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
