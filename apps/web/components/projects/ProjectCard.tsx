"use client";

import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge, healthTone, priorityTone } from "@/components/ui/Badge";
import { formatDuration, titleCase, timeAgo } from "@/lib/formatters";
import type { Project } from "@/lib/types";

export function ProjectCard({ project, view = "grid" }: { project: Project; view?: "grid" | "list" }) {
  const openTasks = project.openTaskCount ?? 0;
  const blocked = project.blockedTaskCount ?? 0;
  const burn = project.burnPercent;

  if (view === "list") {
    return (
      <Link
        href={`/projects/${project.id}`}
        className="focus-ring flex items-center gap-4 rounded-md border border-border bg-surface px-4 py-3 hover:bg-surface-hover"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color ?? "#5b8def" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{project.name}</span>
            <Badge tone={healthTone(project.health)} dot>
              {titleCase(project.health)}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">
            {titleCase(project.type)} · {titleCase(project.status)} · updated {timeAgo(project.lastActivityAt)}
          </p>
        </div>
        <Badge tone={priorityTone(project.priority)}>{titleCase(project.priority)}</Badge>
        {blocked > 0 ? (
          <span className="shrink-0 text-xs font-medium text-danger">{blocked} blocked</span>
        ) : null}
        <span className="w-24 shrink-0 text-right text-xs text-ink-muted">{openTasks} open</span>
        <span className="w-20 shrink-0 text-right text-xs text-ink-muted">{formatDuration(project.minutesThisWeek ?? 0)}</span>
      </Link>
    );
  }

  return (
    <Link href={`/projects/${project.id}`} className="focus-ring block">
      <Card className="h-full transition-colors hover:bg-surface-hover">
        <CardBody className="flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{project.name}</p>
              <p className="text-xs text-ink-faint">{titleCase(project.type)}</p>
            </div>
            <Badge tone={healthTone(project.health)} dot>
              {titleCase(project.health)}
            </Badge>
          </div>

          {project.healthReason ? <p className="line-clamp-2 text-xs text-ink-muted">{project.healthReason}</p> : null}

          <div className="mt-auto grid grid-cols-2 gap-2 pt-2 text-xs">
            <Stat label="Status" value={titleCase(project.status)} />
            <Stat label="Priority" value={titleCase(project.priority)} />
            <Stat
              label="Open tasks"
              value={blocked > 0 ? `${openTasks} · ${blocked} blocked` : String(openTasks)}
              tone={blocked > 0 ? "danger" : undefined}
            />
            <Stat label="This week" value={formatDuration(project.minutesThisWeek ?? 0)} />
            {burn !== null && burn !== undefined ? (
              <Stat
                label="Budget burn"
                value={`${burn.toFixed(1)}%`}
                tone={burn >= 90 ? "danger" : burn >= 75 ? "warning" : undefined}
              />
            ) : (
              <Stat label="Budget" value="None" />
            )}
            {project.nextMilestone ? (
              <Stat label="Next milestone" value={project.nextMilestone.title} />
            ) : (
              <Stat label="Last activity" value={timeAgo(project.lastActivityAt)} />
            )}
          </div>

          {project.technologyTags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {project.technologyTags.slice(0, 4).map((tag) => (
                <span key={tag} className="rounded bg-surface-hover px-1.5 py-0.5 text-xxs text-ink-faint">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink";
  return (
    <div>
      <p className="text-ink-faint">{label}</p>
      <p className={`truncate font-medium ${toneClass}`} title={value}>
        {value}
      </p>
    </div>
  );
}
