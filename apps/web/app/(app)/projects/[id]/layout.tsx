"use client";

import { ReactNode } from "react";
import { usePathname, useParams } from "next/navigation";
import Link from "next/link";
import { useProject } from "@/hooks/useProjects";
import { Badge, healthTone, priorityTone } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { titleCase, timeAgo } from "@/lib/formatters";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const pathname = usePathname();
  const project = useProject(id);

  const base = `/projects/${id}`;
  const tabs = [
    { label: "Overview", href: base },
    { label: "Tasks", href: `${base}/tasks` },
    { label: "Board", href: `${base}/board` },
    { label: "Milestones", href: `${base}/milestones` },
    { label: "Notes", href: `${base}/notes` },
    { label: "Automations", href: `${base}/automations` },
    { label: "Time", href: `${base}/time` },
    { label: "Budget", href: `${base}/budget` },
    { label: "Activity", href: `${base}/activity` },
    { label: "Settings", href: `${base}/settings` },
  ];
  const active = tabs.find((t) => (t.href === base ? pathname === base : pathname?.startsWith(t.href)))?.href ?? base;

  if (project.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (project.isError || !project.data) {
    return <ErrorState message="Could not load this project." onRetry={() => project.refetch()} />;
  }

  const p = project.data;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/projects" className="text-sm text-ink-faint hover:text-ink-muted hover:underline">
                Projects
              </Link>
              <span className="text-ink-faint">/</span>
              <h1 className="truncate text-lg font-semibold text-ink">{p.name}</h1>
              {p.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={healthTone(p.health)} dot>
                {titleCase(p.health)}
              </Badge>
              <Badge tone={priorityTone(p.priority)}>{titleCase(p.priority)}</Badge>
              <Badge tone="neutral">{titleCase(p.type)}</Badge>
              <Badge tone="neutral">{titleCase(p.status)}</Badge>
              {p.stakeholderLabel ? <span className="text-xs text-ink-faint">{p.stakeholderLabel}</span> : null}
              <span className="text-xs text-ink-faint">updated {timeAgo(p.lastActivityAt)}</span>
            </div>
            {p.healthReason ? <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{p.healthReason}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-xs">
            {p.repositoryUrl ? <ExternalLink href={p.repositoryUrl} label="Repo" /> : null}
            {p.deploymentUrl ? <ExternalLink href={p.deploymentUrl} label="Live" /> : null}
            {p.documentationUrl ? <ExternalLink href={p.documentationUrl} label="Docs" /> : null}
          </div>
        </div>
      </div>

      <Tabs items={tabs} active={active} />

      <div>{children}</div>
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2.5 py-1 font-medium text-ink-muted hover:bg-surface-hover hover:text-ink"
    >
      {label}
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M4 8 8 4M5 4h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
