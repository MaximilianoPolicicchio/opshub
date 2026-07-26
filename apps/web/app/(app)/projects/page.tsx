"use client";

import { useState } from "react";
import Link from "next/link";
import { ProjectType, ProjectStatus, ProjectHealth, Priority } from "@opshub/contracts";
import { useProjects } from "@/hooks/useProjects";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { titleCase } from "@/lib/formatters";

export default function ProjectsPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filters, setFilters] = useState<{ status?: string; health?: string; type?: string; priority?: string; q?: string }>({});
  const [search, setSearch] = useState("");

  const projects = useProjects({ ...filters, q: search || undefined });

  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Projects</h1>
        <Link href="/projects/new">
          <Button variant="primary">New project</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
          aria-label="Search projects"
        />
        <Select className="w-40" placeholder="All statuses" value={filters.status ?? ""} onChange={(e) => setFilter("status", e.target.value)}>
          {ProjectStatus.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
        <Select className="w-44" placeholder="All health" value={filters.health ?? ""} onChange={(e) => setFilter("health", e.target.value)}>
          {ProjectHealth.map((h) => (
            <option key={h} value={h}>
              {titleCase(h)}
            </option>
          ))}
        </Select>
        <Select className="w-44" placeholder="All types" value={filters.type ?? ""} onChange={(e) => setFilter("type", e.target.value)}>
          {ProjectType.map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </Select>
        <Select className="w-40" placeholder="All priorities" value={filters.priority ?? ""} onChange={(e) => setFilter("priority", e.target.value)}>
          {Priority.map((p) => (
            <option key={p} value={p}>
              {titleCase(p)}
            </option>
          ))}
        </Select>

        <div className="ml-auto flex rounded-md border border-border p-0.5">
          <button
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            className={`focus-ring rounded px-2 py-1 text-xs ${view === "grid" ? "bg-surface-hover text-ink" : "text-ink-faint"}`}
          >
            Grid
          </button>
          <button
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={`focus-ring rounded px-2 py-1 text-xs ${view === "list" ? "bg-surface-hover text-ink" : "text-ink-faint"}`}
          >
            List
          </button>
        </div>
      </div>

      {projects.isLoading ? (
        <SkeletonCardGrid />
      ) : projects.isError ? (
        <ErrorState onRetry={() => projects.refetch()} />
      ) : (projects.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="No projects match these filters"
          description="Try clearing filters, or create your first project to get going."
          action={
            <Link href="/projects/new">
              <Button variant="primary" size="sm">
                New project
              </Button>
            </Link>
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.data!.rows.map((p) => (
            <ProjectCard key={p.id} project={p} view="grid" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {projects.data!.rows.map((p) => (
            <ProjectCard key={p.id} project={p} view="list" />
          ))}
        </div>
      )}
    </div>
  );
}
