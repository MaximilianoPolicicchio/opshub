import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ProjectHealth, ProjectStatus, ProjectType, Priority } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { ProjectHealthService } from "./project-health.service";
import { ProjectTemplatesService, StarterTaskDef } from "./project-templates.service";
import { calculateBudgetBurn } from "../budgets/budget-calculator.logic";

export interface ProjectListFilters {
  status?: ProjectStatus;
  health?: ProjectHealth;
  type?: ProjectType;
  priority?: Priority;
  tag?: string;
  q?: string;
}

export interface WizardBudgetInput {
  billingModel: "FIXED_PRICE" | "HOURLY" | "INTERNAL";
  currency?: string;
  budgetAmount?: number | null;
  hourlyRate?: number | null;
  estimatedHours?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  alertThresholds?: number[];
}

export interface CreateProjectWizardInput {
  name: string;
  type: ProjectType;
  status?: ProjectStatus;
  priority?: Priority;
  technologyTags?: string[];
  description?: string | null;
  stakeholderLabel?: string | null;
  color?: string | null;
  links?: { repositoryUrl?: string | null; deploymentUrl?: string | null; documentationUrl?: string | null };
  budget?: WizardBudgetInput;
  templateKey?: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly health: ProjectHealthService,
    private readonly templates: ProjectTemplatesService,
  ) {}

  async list(workspaceId: string, filters: ProjectListFilters, page = 1, pageSize = 50) {
    const where: Prisma.ProjectWhereInput = {
      workspaceId,
      archivedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.health ? { health: filters.health } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.tag ? { technologyTags: { has: filters.tag } } : {}),
      ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" } } : {}),
    };
    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { lastActivityAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { budget: true },
      }),
      this.prisma.project.count({ where }),
    ]);

    const rows = await this.withListAggregates(workspaceId, projects);
    return { rows, total, page, pageSize };
  }

  /**
   * The Projects view needs more than the bare row: open/blocked task counts,
   * time logged this week, budget burn, and the next milestone. These are
   * aggregated in a handful of grouped queries rather than per-project loops so
   * the page stays a fixed number of round-trips regardless of project count.
   */
  private async withListAggregates(
    workspaceId: string,
    projects: (Prisma.ProjectGetPayload<{ include: { budget: true } }>)[],
  ) {
    if (projects.length === 0) return [];
    const projectIds = projects.map((p) => p.id);

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    // ISO week: Monday as the first day.
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    const [openTasks, blockedTasks, weekTime, budgetTime, nextMilestones] = await Promise.all([
      this.prisma.task.groupBy({
        by: ["projectId"],
        where: { workspaceId, projectId: { in: projectIds }, archivedAt: null, status: { not: "DONE" } },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ["projectId"],
        where: {
          workspaceId,
          projectId: { in: projectIds },
          archivedAt: null,
          status: { not: "DONE" },
          isBlocked: true,
        },
        _count: { _all: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ["projectId"],
        where: { workspaceId, projectId: { in: projectIds }, startTime: { gte: weekStart }, endTime: { not: null } },
        _sum: { durationMinutes: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ["projectId", "billable"],
        where: { workspaceId, projectId: { in: projectIds }, endTime: { not: null } },
        _sum: { durationMinutes: true },
      }),
      this.prisma.milestone.findMany({
        where: {
          workspaceId,
          projectId: { in: projectIds },
          status: { notIn: ["DONE", "CANCELLED"] },
        },
        orderBy: [{ targetDate: "asc" }, { sortOrder: "asc" }],
        select: { id: true, projectId: true, title: true, targetDate: true },
      }),
    ]);

    const openByProject = new Map(openTasks.map((r) => [r.projectId, r._count._all]));
    const blockedByProject = new Map(blockedTasks.map((r) => [r.projectId, r._count._all]));
    const weekByProject = new Map(weekTime.map((r) => [r.projectId, r._sum.durationMinutes ?? 0]));

    const totalMinutes = new Map<string, number>();
    const billableMinutes = new Map<string, number>();
    for (const r of budgetTime) {
      const minutes = r._sum.durationMinutes ?? 0;
      totalMinutes.set(r.projectId, (totalMinutes.get(r.projectId) ?? 0) + minutes);
      if (r.billable) billableMinutes.set(r.projectId, (billableMinutes.get(r.projectId) ?? 0) + minutes);
    }

    // Milestones come back ordered, so the first hit per project is the next one.
    const nextMilestoneByProject = new Map<string, (typeof nextMilestones)[number]>();
    for (const m of nextMilestones) {
      if (!nextMilestoneByProject.has(m.projectId)) nextMilestoneByProject.set(m.projectId, m);
    }

    return projects.map((project) => {
      const budget = project.budget;
      let burnPercent: number | null = null;
      if (budget) {
        const burn = calculateBudgetBurn({
          billingModel: budget.billingModel,
          budgetAmount: budget.budgetAmount ? budget.budgetAmount.toNumber() : null,
          hourlyRate: budget.hourlyRate ? budget.hourlyRate.toNumber() : null,
          estimatedHours: budget.estimatedHours ? budget.estimatedHours.toNumber() : null,
          trackedMinutes: totalMinutes.get(project.id) ?? 0,
          billableMinutes: billableMinutes.get(project.id) ?? 0,
        });
        burnPercent = burn.burnPercent.toNumber();
      }

      return {
        ...project,
        openTaskCount: openByProject.get(project.id) ?? 0,
        blockedTaskCount: blockedByProject.get(project.id) ?? 0,
        minutesThisWeek: weekByProject.get(project.id) ?? 0,
        burnPercent,
        nextMilestone: nextMilestoneByProject.get(project.id) ?? null,
      };
    });
  }

  async findOne(id: string, workspaceId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, workspaceId },
      include: { budget: true },
    });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });
    const [taskCount, milestoneCount] = await Promise.all([
      this.prisma.task.count({ where: { projectId: id, workspaceId, archivedAt: null } }),
      this.prisma.milestone.count({ where: { projectId: id, workspaceId } }),
    ]);
    return { ...project, taskCount, milestoneCount };
  }

  async create(workspaceId: string, actorId: string, input: CreateProjectWizardInput) {
    const templateKey = input.templateKey ?? "empty";
    const template = await this.templates.findByKey(templateKey, workspaceId);

    const result = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          workspaceId,
          name: input.name,
          description: input.description ?? null,
          type: input.type,
          status: input.status ?? "ACTIVE",
          priority: input.priority ?? "MEDIUM",
          technologyTags: input.technologyTags ?? [],
          stakeholderLabel: input.stakeholderLabel ?? null,
          color: input.color ?? null,
          repositoryUrl: input.links?.repositoryUrl ?? null,
          deploymentUrl: input.links?.deploymentUrl ?? null,
          documentationUrl: input.links?.documentationUrl ?? null,
          templateId: template?.id ?? null,
        },
      });

      if (input.budget) {
        await tx.projectBudget.create({
          data: {
            workspaceId,
            projectId: project.id,
            billingModel: input.budget.billingModel,
            currency: input.budget.currency ?? "USD",
            budgetAmount: input.budget.budgetAmount ?? null,
            hourlyRate: input.budget.hourlyRate ?? null,
            estimatedHours: input.budget.estimatedHours ?? null,
            startDate: input.budget.startDate ? new Date(input.budget.startDate) : null,
            endDate: input.budget.endDate ? new Date(input.budget.endDate) : null,
            alertThresholds: input.budget.alertThresholds ?? [50, 75, 90, 100],
          },
        });
        await this.activity.record(
          {
            workspaceId,
            projectId: project.id,
            actorId,
            type: "BUDGET_CREATED",
            entityType: "ProjectBudget",
            summary: `Budget created for ${project.name}`,
          },
          tx,
        );
      }

      const starterTasks = (template?.starterTasks as unknown as StarterTaskDef[]) ?? [];
      const createdTasks = [];
      for (let i = 0; i < starterTasks.length; i++) {
        const def = starterTasks[i];
        const dueDate = def.offsetDays !== undefined ? new Date(project.createdAt.getTime() + def.offsetDays * 86400000) : null;
        const task = await tx.task.create({
          data: {
            workspaceId,
            projectId: project.id,
            title: def.title,
            category: def.category as any,
            priority: def.priority as any,
            status: (i === 0 ? "NEXT" : def.status ?? "BACKLOG") as any,
            dueDate,
            estimatedHours: def.estimatedHours ?? null,
            sortOrder: i,
          },
        });
        createdTasks.push(task);
      }

      await this.activity.record(
        {
          workspaceId,
          projectId: project.id,
          actorId,
          type: "PROJECT_CREATED",
          entityType: "Project",
          entityId: project.id,
          summary: `Project "${project.name}" created`,
        },
        tx,
      );

      if (createdTasks.length > 0) {
        // Batch into one event when > 3 at once, per §2.8f.
        if (createdTasks.length > 3) {
          await this.activity.record(
            {
              workspaceId,
              projectId: project.id,
              actorId,
              type: "TASK_CREATED",
              entityType: "Task",
              summary: `${createdTasks.length} starter tasks created`,
              metadata: { taskIds: createdTasks.map((t) => t.id) },
            },
            tx,
          );
        } else {
          for (const task of createdTasks) {
            await this.activity.record(
              {
                workspaceId,
                projectId: project.id,
                actorId,
                type: "TASK_CREATED",
                entityType: "Task",
                entityId: task.id,
                summary: `Task "${task.title}" created`,
              },
              tx,
            );
          }
        }
      }

      return { project, tasks: createdTasks };
    });

    await this.health.evaluate(result.project.id, workspaceId);
    return this.findOne(result.project.id, workspaceId);
  }

  async update(id: string, workspaceId: string, actorId: string, input: Partial<CreateProjectWizardInput> & { archivedAt?: null }) {
    const existing = await this.prisma.project.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });

    const statusChanged = input.status !== undefined && input.status !== existing.status;

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.technologyTags !== undefined ? { technologyTags: input.technologyTags } : {}),
        ...(input.stakeholderLabel !== undefined ? { stakeholderLabel: input.stakeholderLabel } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.links?.repositoryUrl !== undefined ? { repositoryUrl: input.links.repositoryUrl } : {}),
        ...(input.links?.deploymentUrl !== undefined ? { deploymentUrl: input.links.deploymentUrl } : {}),
        ...(input.links?.documentationUrl !== undefined ? { documentationUrl: input.links.documentationUrl } : {}),
      },
    });

    if (statusChanged) {
      await this.activity.record({
        workspaceId,
        projectId: id,
        actorId,
        type: "PROJECT_STATUS_CHANGED",
        entityType: "Project",
        entityId: id,
        summary: `Project status changed from ${existing.status} to ${updated.status}`,
        metadata: { from: existing.status, to: updated.status },
      });
      await this.health.evaluate(id, workspaceId);
    }

    return this.findOne(id, workspaceId);
  }

  async archive(id: string, workspaceId: string) {
    const existing = await this.prisma.project.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });
    return this.prisma.project.update({
      where: { id },
      data: { archivedAt: new Date(), status: "ARCHIVED" },
    });
  }

  async restore(id: string, workspaceId: string) {
    const existing = await this.prisma.project.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });
    return this.prisma.project.update({
      where: { id },
      data: { archivedAt: null, status: "ACTIVE" },
    });
  }

  async overview(id: string, workspaceId: string) {
    const project = await this.prisma.project.findFirst({ where: { id, workspaceId }, include: { budget: true } });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });

    const [statusCounts, milestones, recentActivity, weekEntries] = await Promise.all([
      this.prisma.task.groupBy({
        by: ["status"],
        where: { projectId: id, workspaceId, archivedAt: null },
        _count: true,
      }),
      this.prisma.milestone.findMany({ where: { projectId: id, workspaceId }, orderBy: { sortOrder: "asc" } }),
      this.prisma.activityEvent.findMany({ where: { projectId: id, workspaceId }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.timeEntry.findMany({
        where: { projectId: id, workspaceId, startTime: { gte: this.startOfWeek() }, endTime: { not: null } },
        select: { durationMinutes: true },
      }),
    ]);

    const hoursThisWeek = weekEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0) / 60;
    const milestoneProgress = milestones.length
      ? milestones.filter((m) => m.status === "DONE").length / milestones.length
      : 0;

    return {
      project,
      countsByStatus: statusCounts,
      milestoneProgress,
      recentActivity,
      hoursThisWeek,
    };
  }

  private startOfWeek(): Date {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  }

  async listActivity(id: string, workspaceId: string) {
    return this.activity.listForProject(id, workspaceId);
  }
}
