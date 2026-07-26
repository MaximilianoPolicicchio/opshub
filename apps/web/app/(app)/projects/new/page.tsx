"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectType, ProjectStatus, Priority, BillingModel } from "@opshub/contracts";
import { useCreateProject, useProjectTemplates } from "@/hooks/useProjects";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { titleCase } from "@/lib/formatters";
import { isApiError } from "@/lib/auth";
import { cn } from "@/lib/cn";

const STEP_LABELS = ["Basics", "Priority & tags", "Links", "Time & budget", "Template"];

interface WizardState {
  name: string;
  type: string;
  description: string;
  status: string;
  priority: string;
  technologyTags: string[];
  stakeholderLabel: string;
  repositoryUrl: string;
  deploymentUrl: string;
  documentationUrl: string;
  hasBudget: boolean;
  billingModel: string;
  currency: string;
  budgetAmount: string;
  hourlyRate: string;
  estimatedHours: string;
  templateKey: string;
}

const initialState: WizardState = {
  name: "",
  type: "PRODUCT",
  description: "",
  status: "ACTIVE",
  priority: "MEDIUM",
  technologyTags: [],
  stakeholderLabel: "",
  repositoryUrl: "",
  deploymentUrl: "",
  documentationUrl: "",
  hasBudget: false,
  billingModel: "HOURLY",
  currency: "USD",
  budgetAmount: "",
  hourlyRate: "",
  estimatedHours: "",
  templateKey: "empty",
};

export default function NewProjectPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>(initialState);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const templates = useProjectTemplates();
  const createProject = useCreateProject();

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !form.technologyTags.includes(tag)) {
      update("technologyTags", [...form.technologyTags, tag]);
    }
    setTagInput("");
  }

  const canProceed = step === 0 ? form.name.trim().length > 0 : true;

  async function onSubmit() {
    setError(null);
    try {
      const project = await createProject.mutateAsync({
        name: form.name.trim(),
        type: form.type,
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        technologyTags: form.technologyTags,
        stakeholderLabel: form.stakeholderLabel || null,
        links: {
          repositoryUrl: form.repositoryUrl || null,
          deploymentUrl: form.deploymentUrl || null,
          documentationUrl: form.documentationUrl || null,
        },
        budget: form.hasBudget
          ? {
              billingModel: form.billingModel,
              currency: form.currency,
              budgetAmount: form.budgetAmount ? Number(form.budgetAmount) : null,
              hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
              estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
              alertThresholds: [50, 75, 90, 100],
            }
          : undefined,
        templateKey: form.templateKey,
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not create the project. Please try again.");
    }
  }

  const selectedTemplate = templates.data?.find((t) => t.key === form.templateKey);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">New project</h1>
        <p className="text-sm text-ink-muted">Five quick steps — under two minutes.</p>
      </div>

      <ol className="flex items-center gap-1.5" aria-label="Wizard progress">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                i === step ? "bg-accent text-white" : i < step ? "bg-accent/20 text-accent" : "bg-surface-hover text-ink-faint",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i + 1}
            </span>
            <span className={cn("hidden text-xs sm:inline", i === step ? "text-ink" : "text-ink-faint")}>{label}</span>
            {i < STEP_LABELS.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      <Card>
        <CardBody className="space-y-4">
          {step === 0 ? (
            <>
              <div>
                <Label htmlFor="w-name">Project name</Label>
                <Input id="w-name" autoFocus value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Maxus Market" />
              </div>
              <div>
                <Label htmlFor="w-type">Type</Label>
                <Select id="w-type" value={form.type} onChange={(e) => update("type", e.target.value)}>
                  {ProjectType.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="w-desc">Description (optional)</Label>
                <Textarea id="w-desc" rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="w-status">Status</Label>
                  <Select id="w-status" value={form.status} onChange={(e) => update("status", e.target.value)}>
                    {ProjectStatus.map((s) => (
                      <option key={s} value={s}>
                        {titleCase(s)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="w-priority">Priority</Label>
                  <Select id="w-priority" value={form.priority} onChange={(e) => update("priority", e.target.value)}>
                    {Priority.map((p) => (
                      <option key={p} value={p}>
                        {titleCase(p)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="w-stakeholder">Client / stakeholder (optional)</Label>
                <Input id="w-stakeholder" value={form.stakeholderLabel} onChange={(e) => update("stakeholderLabel", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="w-tags">Technology tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="w-tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="e.g. nextjs — press Enter"
                  />
                  <Button type="button" variant="secondary" onClick={addTag}>
                    Add
                  </Button>
                </div>
                {form.technologyTags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {form.technologyTags.map((tag) => (
                      <Badge key={tag} tone="neutral">
                        {tag}
                        <button
                          aria-label={`Remove tag ${tag}`}
                          onClick={() => update("technologyTags", form.technologyTags.filter((t) => t !== tag))}
                          className="ml-1"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div>
                <Label htmlFor="w-repo">Repository URL (optional)</Label>
                <Input id="w-repo" type="url" placeholder="https://github.com/…" value={form.repositoryUrl} onChange={(e) => update("repositoryUrl", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="w-deploy">Deployment URL (optional)</Label>
                <Input id="w-deploy" type="url" placeholder="https://…" value={form.deploymentUrl} onChange={(e) => update("deploymentUrl", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="w-docs">Documentation URL (optional)</Label>
                <Input id="w-docs" type="url" placeholder="https://…" value={form.documentationUrl} onChange={(e) => update("documentationUrl", e.target.value)} />
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.hasBudget} onChange={(e) => update("hasBudget", e.target.checked)} className="h-4 w-4 rounded border-border" />
                Track a budget for this project
              </label>
              {form.hasBudget ? (
                <div className="space-y-3 rounded-md border border-border-subtle bg-surface-raised p-3">
                  <div>
                    <Label htmlFor="w-billing">Billing model</Label>
                    <Select id="w-billing" value={form.billingModel} onChange={(e) => update("billingModel", e.target.value)}>
                      {BillingModel.map((b) => (
                        <option key={b} value={b}>
                          {titleCase(b)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="w-currency">Currency</Label>
                      <Input id="w-currency" value={form.currency} onChange={(e) => update("currency", e.target.value.toUpperCase())} maxLength={3} />
                    </div>
                    <div>
                      <Label htmlFor="w-amount">Budget amount</Label>
                      <Input id="w-amount" type="number" min={0} value={form.budgetAmount} onChange={(e) => update("budgetAmount", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="w-rate">Hourly rate</Label>
                      <Input id="w-rate" type="number" min={0} value={form.hourlyRate} onChange={(e) => update("hourlyRate", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="w-est">Estimated hours</Label>
                    <Input id="w-est" type="number" min={0} value={form.estimatedHours} onChange={(e) => update("estimatedHours", e.target.value)} />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Label>Starter template</Label>
              {templates.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div className="space-y-2">
                  {templates.data?.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => update("templateKey", t.key)}
                      className={cn(
                        "focus-ring w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                        form.templateKey === t.key ? "border-accent bg-accent/5" : "border-border hover:bg-surface-hover",
                      )}
                    >
                      <p className="text-sm font-medium text-ink">{t.name}</p>
                      <p className="text-xs text-ink-faint">
                        {t.starterTasks.length > 0 ? `${t.starterTasks.length} starter tasks` : "No starter tasks"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {selectedTemplate && selectedTemplate.starterTasks.length > 0 ? (
                <div className="rounded-md border border-border-subtle bg-surface-raised p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Starter tasks preview</p>
                  <ul className="space-y-1 text-sm text-ink-muted">
                    {selectedTemplate.starterTasks.map((task, i) => (
                      <li key={i}>· {task.title}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          <FieldError>{error}</FieldError>
        </CardBody>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < STEP_LABELS.length - 1 ? (
          <Button variant="primary" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" loading={createProject.isPending} onClick={onSubmit}>
            Create project
          </Button>
        )}
      </div>
    </div>
  );
}
