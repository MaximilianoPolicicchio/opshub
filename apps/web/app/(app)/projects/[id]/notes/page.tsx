"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from "@/hooks/useNotes";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label, Textarea, FieldError } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatDateTime } from "@/lib/formatters";
import type { Note } from "@/lib/types";

export default function ProjectNotesPage() {
  const { id } = useParams<{ id: string }>();
  const notes = useNotes(id);
  const createNote = useCreateNote(id);
  const updateNote = useUpdateNote(id);
  const deleteNote = useDeleteNote(id);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setBody("");
    setPinned(false);
    setDialogOpen(true);
  }

  function openEdit(n: Note) {
    setEditing(n);
    setTitle(n.title ?? "");
    setBody(n.body);
    setPinned(n.pinned);
    setDialogOpen(true);
  }

  async function onSubmit() {
    if (!body.trim()) return;
    const input = { title: title || null, body: body.trim(), pinned };
    if (editing) {
      await updateNote.mutateAsync({ id: editing.id, input });
    } else {
      await createNote.mutateAsync(input);
    }
    setDialogOpen(false);
  }

  const isPending = createNote.isPending || updateNote.isPending;
  const isError = createNote.isError || updateNote.isError;

  const sorted = [...(notes.data ?? [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="primary" onClick={openCreate}>
          New note
        </Button>
      </div>

      {notes.isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={3} />
          </CardBody>
        </Card>
      ) : notes.isError ? (
        <ErrorState onRetry={() => notes.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No notes yet"
          description="Capture context, decisions, or links for this project."
          action={
            <Button variant="primary" size="sm" onClick={openCreate}>
              New note
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sorted.map((n) => (
            <Card key={n.id} className={n.pinned ? "border-accent/30" : undefined}>
              <CardBody className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {n.pinned ? <Badge tone="info">Pinned</Badge> : null}
                    {n.title ? <p className="font-medium text-ink">{n.title}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(n)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Delete this note?")) deleteNote.mutate(n.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink-muted">{n.body}</p>
                <p className="text-xs text-ink-faint">{formatDateTime(n.createdAt)}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Edit note" : "New note"} size="sm">
        <div className="space-y-4">
          <div>
            <Label htmlFor="n-title">Title (optional)</Label>
            <Input id="n-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="n-body">Note</Label>
            <Textarea id="n-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Pin to top
          </label>
          <FieldError>{isError ? "Could not save the note. Please try again." : null}</FieldError>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!body.trim()} loading={isPending} onClick={onSubmit}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
