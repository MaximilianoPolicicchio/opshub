"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProjectType, ProjectStatus, Priority } from "@opshub/contracts";
import { useProject, useUpdateProject, useArchiveProject, useRestoreProject } from "@/hooks/useProjects";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { titleCase } from "@/lib/formatters";
import { isApiError } from "@/lib/auth";

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const project = useProject(id);
  const updateProject = useUpdateProject(id);
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("PRODUCT");
  const [status, setStatus] = useState("ACTIVE");
  const [priority, setPriority] = useState("MEDIUM");
  const [stakeholderLabel, setStakeholderLabel] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [deploymentUrl, setDeploymentUrl] = useState("");
  const [documentationUrl, setDocumentationUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!project.data) return;
    const p = project.data;
    setName(p.name);
    setDescription(p.description ?? "");
    setType(p.type);
    setStatus(p.status);
    setPriority(p.priority);
    setStakeholderLabel(p.stakeholderLabel ?? "");
    setRepositoryUrl(p.repositoryUrl ?? "");
    setDeploymentUrl(p.deploymentUrl ?? "");
    setDocumentationUrl(p.documentationUrl ?? "");
  }, [project.data]);

  if (project.isLoading) return <Skeleton className="h-96 w-full" />;
  if (project.isError || !project.data) return <ErrorState onRetry={() => project.refetch()} />;

  async function onSave() {
    setError(null);
    setSaved(false);
    try {
      await updateProject.mutateAsync({
        name: name.trim(),
        description: description || null,
        type,
        status,
        priority,
        stakeholderLabel: stakeholderLabel || null,
        links: {
          repositoryUrl: repositoryUrl || null,
          deploymentUrl: deploymentUrl || null,
          documentationUrl: documentationUrl || null,
        },
      });
      setSaved(true);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not save changes. Please try again.");
    }
  }

  const archived = !!project.data.archivedAt;

  async function onArchiveToggle() {
    if (archived) {
      await restoreProject.mutateAsync(id);
    } else {
      if (!confirm(`Archive "${project.data!.name}"? You can restore it later.`)) return;
      await archiveProject.mutateAsync(id);
      router.push("/projects");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-desc">Description</Label>
            <Textarea id="s-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="s-type">Type</Label>
              <Select id="s-type" value={type} onChange={(e) => setType(e.target.value)}>
                {ProjectType.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-status">Status</Label>
              <Select id="s-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {ProjectStatus.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-priority">Priority</Label>
              <Select id="s-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Priority.map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="s-stakeholder">Client / stakeholder</Label>
            <Input id="s-stakeholder" value={stakeholderLabel} onChange={(e) => setStakeholderLabel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-repo">Repository URL</Label>
            <Input id="s-repo" type="url" value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-deploy">Deployment URL</Label>
            <Input id="s-deploy" type="url" value={deploymentUrl} onChange={(e) => setDeploymentUrl(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-docs">Documentation URL</Label>
            <Input id="s-docs" type="url" value={documentationUrl} onChange={(e) => setDocumentationUrl(e.target.value)} />
          </div>
          <FieldError>{error}</FieldError>
          {saved ? <p className="text-xs text-health-healthy">Saved.</p> : null}
          <div className="flex justify-end">
            <Button variant="primary" disabled={!name.trim()} loading={updateProject.isPending} onClick={onSave}>
              Save changes
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="border-health-blocked/30">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardBody className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            {archived ? "This project is archived." : "Archiving hides this project from active lists. It can be restored later."}
          </p>
          <Button variant="danger" loading={archiveProject.isPending || restoreProject.isPending} onClick={onArchiveToggle}>
            {archived ? "Restore project" : "Archive project"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
