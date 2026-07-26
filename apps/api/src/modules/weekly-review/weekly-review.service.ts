import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { WebhookDispatcherService } from "../automations/webhook-dispatcher.service";

interface CachedSnapshot {
  weekStartKey: string;
  generatedAt: number;
  payload: any;
}

@Injectable()
export class WeeklyReviewService {
  private cache = new Map<string, CachedSnapshot>();
  private readonly CACHE_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  private weekBounds(weekStart?: string): { start: Date; end: Date } {
    const start = weekStart ? new Date(weekStart) : this.currentWeekStart();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { start, end };
  }

  private currentWeekStart(): Date {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  }

  async get(workspaceId: string, weekStart?: string) {
    const { start, end } = this.weekBounds(weekStart);
    const key = `${workspaceId}:${start.toISOString().slice(0, 10)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.generatedAt < this.CACHE_MS) {
      return cached.payload;
    }
    const payload = await this.buildSnapshot(workspaceId, start, end);
    this.cache.set(key, { weekStartKey: key, generatedAt: Date.now(), payload });
    return payload;
  }

  async generate(workspaceId: string, weekStart?: string) {
    const { start, end } = this.weekBounds(weekStart);
    const payload = await this.buildSnapshot(workspaceId, start, end);

    await this.activity.record({
      workspaceId,
      type: "WEEKLY_REVIEW_GENERATED",
      entityType: "WeeklyReview",
      summary: `Weekly review generated for week of ${start.toISOString().slice(0, 10)}`,
      metadata: { periodStart: start.toISOString(), periodEnd: end.toISOString() },
    });

    void this.dispatcher.dispatchTrigger({
      workspaceId,
      trigger: "WEEKLY_REVIEW_GENERATED",
      dedupeEntityId: `weekly:${start.toISOString().slice(0, 10)}`,
      payload,
    });

    const key = `${workspaceId}:${start.toISOString().slice(0, 10)}`;
    this.cache.set(key, { weekStartKey: key, generatedAt: Date.now(), payload });
    return payload;
  }

  private async buildSnapshot(workspaceId: string, periodStart: Date, periodEnd: Date) {
    const [completedTasks, timeEntries, projects, automationFailures, upcomingDue] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId, status: "DONE", completedAt: { gte: periodStart, lt: periodEnd } },
        select: { id: true, title: true, projectId: true, project: { select: { name: true } } },
      }),
      this.prisma.timeEntry.findMany({
        where: { workspaceId, startTime: { gte: periodStart, lt: periodEnd }, endTime: { not: null } },
        select: { durationMinutes: true, billable: true },
      }),
      this.prisma.project.findMany({ where: { workspaceId, archivedAt: null } }),
      this.prisma.automationRun.findMany({
        where: { workspaceId, status: "FAILED", startedAt: { gte: periodStart, lt: periodEnd } },
      }),
      this.prisma.task.findMany({
        where: {
          workspaceId,
          archivedAt: null,
          status: { not: "DONE" },
          dueDate: { gte: periodEnd, lt: new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true, title: true, dueDate: true },
        take: 20,
      }),
    ]);

    const hoursTracked = timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0) / 60;
    const billableHours = timeEntries.filter((e) => e.billable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0) / 60;

    const tasksCompletedByProject = new Map<string, { projectId: string; projectName: string; count: number }>();
    for (const t of completedTasks) {
      const entry = tasksCompletedByProject.get(t.projectId) ?? {
        projectId: t.projectId,
        projectName: t.project.name,
        count: 0,
      };
      entry.count++;
      tasksCompletedByProject.set(t.projectId, entry);
    }

    const projectsAtRisk = projects
      .filter((p) => p.health === "NEEDS_ATTENTION" || p.health === "BLOCKED")
      .map((p) => ({ id: p.id, name: p.name, health: p.health }));

    const overdueCarryOver = await this.prisma.task.count({
      where: { workspaceId, archivedAt: null, status: { not: "DONE" }, dueDate: { lt: periodStart } },
    });

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      tasksCompleted: completedTasks.length,
      tasksCompletedByProject: Array.from(tasksCompletedByProject.values()),
      hoursTracked,
      billableHours,
      projectsAtRisk,
      overdueCarryOver,
      upcomingDue: upcomingDue.map((t) => ({ taskId: t.id, title: t.title, dueDate: t.dueDate })),
      automationFailures: automationFailures.length,
    };
  }
}
