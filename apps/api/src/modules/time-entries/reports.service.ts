import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type GroupBy = "project" | "day" | "week" | "task";

@Injectable()
export class TimeReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(workspaceId: string, groupBy: GroupBy, from?: Date, to?: Date) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        workspaceId,
        endTime: { not: null },
        ...(from || to
          ? { startTime: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { project: { select: { name: true } }, task: { select: { title: true } } },
    });

    const groups = new Map<string, { key: string; label: string; minutes: number; billableMinutes: number }>();

    for (const entry of entries) {
      const key = this.groupKey(groupBy, entry);
      const label = this.groupLabel(groupBy, entry, key);
      const g = groups.get(key) ?? { key, label, minutes: 0, billableMinutes: 0 };
      g.minutes += entry.durationMinutes ?? 0;
      if (entry.billable) g.billableMinutes += entry.durationMinutes ?? 0;
      groups.set(key, g);
    }

    const rows = Array.from(groups.values()).map((g) => ({
      ...g,
      value: g.minutes / 60,
    }));

    // Map insertion order follows however the rows came back from the database,
    // which is not meaningful to a reader. Time buckets read chronologically
    // (most recent first); project/task buckets read largest-first.
    if (groupBy === "day" || groupBy === "week") {
      rows.sort((a, b) => b.key.localeCompare(a.key));
    } else {
      rows.sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));
    }

    const totals = {
      minutes: rows.reduce((s, r) => s + r.minutes, 0),
      billableMinutes: rows.reduce((s, r) => s + r.billableMinutes, 0),
    };

    return { rows, totals };
  }

  private groupKey(groupBy: GroupBy, entry: any): string {
    switch (groupBy) {
      case "project":
        return entry.projectId;
      case "task":
        return entry.taskId ?? "no-task";
      case "day":
        return entry.startTime.toISOString().slice(0, 10);
      case "week": {
        const d = new Date(entry.startTime);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().slice(0, 10);
      }
    }
  }

  private groupLabel(groupBy: GroupBy, entry: any, key: string): string {
    switch (groupBy) {
      case "project":
        return entry.project?.name ?? key;
      case "task":
        return entry.task?.title ?? "No task";
      default:
        return key;
    }
  }
}
