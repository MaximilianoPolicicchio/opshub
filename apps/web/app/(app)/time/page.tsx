"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useTimeEntries, useTimeReports, useCreateTimeEntry, useUpdateTimeEntry, useDeleteTimeEntry } from "@/hooks/useTimeEntries";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label, Textarea, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList, Skeleton } from "@/components/ui/Skeleton";
import { formatDateTime, formatDuration } from "@/lib/formatters";
import type { Project, Task, TimeEntry } from "@/lib/types";

type GroupBy = "day" | "week" | "project" | "task";

export default function TimePage() {
  const [projectId, setProjectId] = useState("");
  const [billable, setBillable] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);

  const filters = {
    projectId: projectId || undefined,
    billable: billable || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
  };

  const entries = useTimeEntries(filters);
  const reports = useTimeReports({ groupBy, from: filters.from, to: filters.to, projectId: filters.projectId });
  const deleteEntry = useDeleteTimeEntry();

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects({}),
    queryFn: () => api.get<{ rows: Project[] }>("/projects"),
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(e: TimeEntry) {
    setEditing(e);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Time</h1>
        <Button variant="primary" onClick={openCreate}>
          Log time
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-48" placeholder="All projects" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projectsQuery.data?.rows.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select className="w-40" placeholder="All entries" value={billable} onChange={(e) => setBillable(e.target.value)}>
          <option value="true">Billable</option>
          <option value="false">Non-billable</option>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="w-40" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report</CardTitle>
          <div className="flex gap-1">
            {(["day", "week", "project", "task"] as GroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`focus-ring rounded px-2 py-1 text-xs capitalize ${groupBy === g ? "bg-surface-hover text-ink" : "text-ink-faint"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardBody>
          {reports.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (reports.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-faint">No data for this range.</p>
          ) : (
            <div className="space-y-2">
              {reports.data!.rows.map((row) => {
                const max = Math.max(...reports.data!.rows.map((r) => r.minutes), 1);
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs text-ink-muted">{row.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(row.minutes / max) * 100}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-faint">{formatDuration(row.minutes)}</span>
                  </div>
                );
              })}
              <p className="pt-2 text-xs text-ink-faint">
                Total: {formatDuration(reports.data!.totals.minutes)} · Billable: {formatDuration(reports.data!.totals.billableMinutes)}
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {entries.isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={6} />
          </CardBody>
        </Card>
      ) : entries.isError ? (
        <ErrorState onRetry={() => entries.refetch()} />
      ) : (entries.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No time entries"
          description="Log time manually or start a timer from Today."
          action={
            <Button variant="primary" size="sm" onClick={openCreate}>
              Log time
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <Thead>
              <Tr>
                <Th>Started</Th>
                <Th>Project</Th>
                <Th>Task</Th>
                <Th>Description</Th>
                <Th>Duration</Th>
                <Th>Billable</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {entries.data!.map((e) => (
                <Tr key={e.id}>
                  <Td>{formatDateTime(e.startTime)}</Td>
                  <Td>{e.project?.name ?? "—"}</Td>
                  <Td>{e.task?.title ?? <span className="text-ink-faint">—</span>}</Td>
                  <Td className="max-w-xs truncate">{e.description ?? <span className="text-ink-faint">—</span>}</Td>
                  <Td>{e.endTime ? formatDuration(e.durationMinutes) : <Badge tone="info">Running</Badge>}</Td>
                  <Td>{e.billable ? <Badge tone="healthy">Billable</Badge> : <Badge tone="neutral">No</Badge>}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this time entry?")) deleteEntry.mutate(e.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <TimeEntryDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        entry={editing}
        projects={projectsQuery.data?.rows ?? []}
      />
    </div>
  );
}

function TimeEntryDialog({
  open,
  onClose,
  entry,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  entry: TimeEntry | null;
  projects: Project[];
}) {
  const [projectId, setProjectId] = useState(entry?.projectId ?? "");
  const [taskId, setTaskId] = useState(entry?.taskId ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [billable, setBillable] = useState(entry?.billable ?? false);
  const [startTime, setStartTime] = useState(entry?.startTime ? toLocalInput(entry.startTime) : toLocalInput(new Date().toISOString()));
  const [endTime, setEndTime] = useState(entry?.endTime ? toLocalInput(entry.endTime) : "");

  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks({ projectId }),
    queryFn: () => api.get<Task[]>(`/tasks?projectId=${projectId}`),
    enabled: open && !!projectId,
  });

  async function onSubmit() {
    if (!projectId || !startTime) return;
    const input: Record<string, unknown> = {
      projectId,
      taskId: taskId || null,
      description: description || null,
      billable,
      startTime: new Date(startTime).toISOString(),
      endTime: endTime ? new Date(endTime).toISOString() : null,
    };
    if (entry) {
      await updateEntry.mutateAsync({ id: entry.id, input });
    } else {
      await createEntry.mutateAsync(input);
    }
    onClose();
  }

  const isPending = createEntry.isPending || updateEntry.isPending;
  const isError = createEntry.isError || updateEntry.isError;

  return (
    <Dialog open={open} onClose={onClose} title={entry ? "Edit time entry" : "Log time"} size="sm">
      <div className="space-y-4">
        <div>
          <Label htmlFor="t-project">Project</Label>
          <Select
            id="t-project"
            placeholder="Select a project…"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTaskId("");
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="t-task">Task (optional)</Label>
          <Select id="t-task" placeholder="No specific task" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!projectId}>
            {tasksQuery.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="t-start">Start</Label>
            <Input id="t-start" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="t-end">End</Label>
            <Input id="t-end" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="t-desc">Description</Label>
          <Textarea id="t-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Billable
        </label>
        <FieldError>{isError ? "Could not save the time entry. Please try again." : null}</FieldError>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!projectId || !startTime} loading={isPending} onClick={onSubmit}>
            {entry ? "Save" : "Log time"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
