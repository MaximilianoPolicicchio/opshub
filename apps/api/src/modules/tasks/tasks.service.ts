import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Priority, TaskCategory, TaskStatus } from "@prisma/client";
import { createId } from "@paralleldrive/cuid2";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { IProjectHealthEvaluator } from "../projects/project-health.service";
import { WebhookDispatcherService } from "../automations/webhook-dispatcher.service";
import { wouldCreateCycle } from "./task-dependency.logic";
import { computeNextDueDate, shouldStopRecurrence } from "./task-recurrence.logic";
import {
  classifyActionableReason,
  compareActionableTasks,
  isTaskActionable,
  capNextPriorityBackfill,
  ActionableReason,
} from "./actionable-task.logic";

export interface CreateTaskInput {
  projectId: string;
  milestoneId?: string | null;
  title: string;
  description?: string | null;
  category?: TaskCategory;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: string | null;
  estimatedHours?: number | null;
  tags?: string[];
  recurrenceUnit?: "DAY" | "WEEK" | "MONTH" | null;
  recurrenceInterval?: number | null;
  recurrenceAnchor?: "DUE_DATE" | "COMPLETION_DATE" | null;
  recurrenceEndsAt?: string | null;
}

const HIGH_PRIORITIES: Priority[] = ["CRITICAL", "HIGH"];

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly health: IProjectHealthEvaluator,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  async list(
    workspaceId: string,
    filters: {
      projectId?: string;
      status?: TaskStatus;
      priority?: Priority;
      category?: TaskCategory;
      tag?: string;
      dueBefore?: Date;
      blocked?: boolean;
      q?: string;
    },
  ) {
    const where: Prisma.TaskWhereInput = {
      workspaceId,
      archivedAt: null,
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.tag ? { tags: { has: filters.tag } } : {}),
      ...(filters.dueBefore ? { dueDate: { lt: filters.dueBefore } } : {}),
      ...(filters.blocked !== undefined ? { isBlocked: filters.blocked } : {}),
      ...(filters.q ? { title: { contains: filters.q, mode: "insensitive" } } : {}),
    };
    return this.prisma.task.findMany({ where, orderBy: [{ status: "asc" }, { sortOrder: "asc" }] });
  }

  async findOne(id: string, workspaceId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, workspaceId },
      include: { dependencies: true, dependents: true, links: true, notes: true },
    });
    if (!task) throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found" });
    const loggedMinutes = await this.prisma.timeEntry.aggregate({
      where: { taskId: id, workspaceId, endTime: { not: null } },
      _sum: { durationMinutes: true },
    });
    return { ...task, loggedHours: (loggedMinutes._sum.durationMinutes ?? 0) / 60 };
  }

  async create(workspaceId: string, actorId: string, input: CreateTaskInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, workspaceId } });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });

    const maxSort = await this.prisma.task.findFirst({
      where: { projectId: input.projectId, workspaceId, status: input.status ?? "BACKLOG" },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const isRecurring = !!(input.recurrenceUnit && input.recurrenceInterval);

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          workspaceId,
          projectId: input.projectId,
          milestoneId: input.milestoneId ?? null,
          title: input.title,
          description: input.description ?? null,
          category: input.category ?? "FEATURE",
          priority: input.priority ?? "MEDIUM",
          status: input.status ?? "BACKLOG",
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          estimatedHours: input.estimatedHours ?? null,
          tags: input.tags ?? [],
          sortOrder: (maxSort?.sortOrder ?? -1) + 1,
          recurrenceUnit: input.recurrenceUnit ?? null,
          recurrenceInterval: input.recurrenceInterval ?? null,
          recurrenceAnchor: input.recurrenceAnchor ?? "DUE_DATE",
          recurrenceEndsAt: input.recurrenceEndsAt ? new Date(input.recurrenceEndsAt) : null,
          recurrenceSeriesId: isRecurring ? createId() : null,
          occurrenceIndex: isRecurring ? 0 : null,
        },
      });

      await this.activity.record(
        {
          workspaceId,
          projectId: input.projectId,
          actorId,
          type: "TASK_CREATED",
          entityType: "Task",
          entityId: created.id,
          summary: `Task "${created.title}" created`,
        },
        tx,
      );

      return created;
    });

    await this.health.evaluate(input.projectId, workspaceId);
    return this.findOne(task.id, workspaceId);
  }

  async update(id: string, workspaceId: string, actorId: string, input: Partial<CreateTaskInput>) {
    const existing = await this.prisma.task.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found" });

    const priorityChanging = input.priority !== undefined && input.priority !== existing.priority;
    const priorityCrossesHighBoundary =
      priorityChanging &&
      (HIGH_PRIORITIES.includes(existing.priority) !== HIGH_PRIORITIES.includes(input.priority!));

    const updated = await this.prisma.task.update({
      where: { id, workspaceId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.milestoneId !== undefined ? { milestoneId: input.milestoneId } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
        ...(input.estimatedHours !== undefined ? { estimatedHours: input.estimatedHours } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.recurrenceUnit !== undefined ? { recurrenceUnit: input.recurrenceUnit } : {}),
        ...(input.recurrenceInterval !== undefined ? { recurrenceInterval: input.recurrenceInterval } : {}),
        ...(input.recurrenceAnchor !== undefined ? { recurrenceAnchor: input.recurrenceAnchor } : {}),
        ...(input.recurrenceEndsAt !== undefined
          ? { recurrenceEndsAt: input.recurrenceEndsAt ? new Date(input.recurrenceEndsAt) : null }
          : {}),
      },
    });

    if (priorityCrossesHighBoundary) {
      await this.activity.record({
        workspaceId,
        projectId: existing.projectId,
        actorId,
        type: "TASK_PRIORITY_CHANGED",
        entityType: "Task",
        entityId: id,
        summary: `Task "${updated.title}" priority changed from ${existing.priority} to ${updated.priority}`,
        metadata: { from: existing.priority, to: updated.priority },
      });
    }

    await this.health.evaluate(existing.projectId, workspaceId);
    return this.findOne(id, workspaceId);
  }

  /**
   * PATCH /tasks/:id/status — the guarded transition. Fresh count of open
   * prerequisites inside the transaction with FOR UPDATE; DONE transitions
   * with open prerequisites are rejected with 409. Non-DONE transitions are
   * always allowed.
   */
  async updateStatus(id: string, workspaceId: string, actorId: string, status: TaskStatus) {
    const existing = await this.prisma.task.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found" });
    if (existing.status === status) return this.findOne(id, workspaceId);

    const result = await this.prisma.$transaction(async (tx) => {
      if (status === "DONE") {
        const blockers = await tx.$queryRaw<{ id: string; title: string }[]>`
          SELECT t.id, t.title FROM "TaskDependency" td
          JOIN "Task" t ON t.id = td."dependsOnTaskId"
          WHERE td."taskId" = ${id} AND t.status != 'DONE' AND t."archivedAt" IS NULL
          FOR UPDATE OF t
        `;
        if (blockers.length > 0) {
          throw new ConflictException({
            code: "TASK_BLOCKED_BY_DEPENDENCY",
            message: "This task is blocked by unfinished prerequisites",
            details: { blockingTaskIds: blockers.map((b) => b.id) },
          });
        }
      }

      const updated = await tx.task.update({
        where: { id, workspaceId },
        data: {
          status,
          ...(status === "DONE" ? { completedAt: new Date() } : {}),
        },
      });

      if (status === "DONE") {
        await this.activity.record(
          {
            workspaceId,
            projectId: existing.projectId,
            actorId,
            type: "TASK_COMPLETED",
            entityType: "Task",
            entityId: id,
            summary: `Task "${updated.title}" completed`,
          },
          tx,
        );
      } else {
        await this.activity.record(
          {
            workspaceId,
            projectId: existing.projectId,
            actorId,
            type: "TASK_STATUS_CHANGED",
            entityType: "Task",
            entityId: id,
            summary: `Task "${updated.title}" moved to ${status}`,
            metadata: { from: existing.status, to: status },
          },
          tx,
        );
      }

      // Recompute isBlocked for dependents of this task (a DONE/undone transition can flip them).
      await this.recomputeDependentsBlocked(tx, id, workspaceId, actorId);

      // Recurrence: create the next occurrence in the same transaction.
      if (status === "DONE" && updated.recurrenceSeriesId && updated.recurrenceUnit && updated.recurrenceInterval) {
        await this.createNextOccurrence(tx, updated, workspaceId, actorId);
      }

      return updated;
    });

    await this.health.evaluate(existing.projectId, workspaceId);
    return this.findOne(result.id, workspaceId);
  }

  async updatePosition(id: string, workspaceId: string, status: TaskStatus, sortOrder: number) {
    const existing = await this.prisma.task.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found" });
    return this.prisma.task.update({ where: { id, workspaceId }, data: { status, sortOrder } });
  }

  async remove(id: string, workspaceId: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found" });
    await this.prisma.task.update({ where: { id, workspaceId }, data: { archivedAt: new Date() } });
    await this.health.evaluate(existing.projectId, workspaceId);
  }

  async surface(id: string, workspaceId: string, date: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found" });
    return this.prisma.task.update({ where: { id, workspaceId }, data: { surfacedForDate: new Date(date) } });
  }

  // --- Dependencies -------------------------------------------------------

  async addDependency(taskId: string, workspaceId: string, dependsOnTaskId: string) {
    const [task, dependsOn] = await Promise.all([
      this.prisma.task.findFirst({ where: { id: taskId, workspaceId } }),
      this.prisma.task.findFirst({ where: { id: dependsOnTaskId, workspaceId } }),
    ]);
    if (!task || !dependsOn) throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found" });
    if (task.projectId !== dependsOn.projectId) {
      throw new BadRequestException({
        code: "CROSS_PROJECT_DEPENDENCY",
        message: "Dependencies must be within the same project",
      });
    }

    const existingEdges = await this.prisma.taskDependency.findMany({
      where: { workspaceId, task: { projectId: task.projectId } },
      select: { taskId: true, dependsOnTaskId: true },
    });
    if (wouldCreateCycle(existingEdges, taskId, dependsOnTaskId)) {
      throw new BadRequestException({ code: "DEPENDENCY_CYCLE", message: "This dependency would create a cycle" });
    }

    const dep = await this.prisma.taskDependency.create({
      data: { workspaceId, taskId, dependsOnTaskId },
    });

    await this.recomputeBlocked(this.prisma, taskId, workspaceId, null);
    await this.health.evaluate(task.projectId, workspaceId);
    return dep;
  }

  async removeDependency(taskId: string, depId: string, workspaceId: string) {
    const dep = await this.prisma.taskDependency.findFirst({ where: { id: depId, taskId, workspaceId } });
    if (!dep) throw new NotFoundException({ code: "NOT_FOUND", message: "Dependency not found" });
    await this.prisma.taskDependency.delete({ where: { id: depId, workspaceId } });
    const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId } });
    await this.recomputeBlocked(this.prisma, taskId, workspaceId, null);
    if (task) await this.health.evaluate(task.projectId, workspaceId);
  }

  // --- Links ---------------------------------------------------------------

  async addLink(taskId: string, workspaceId: string, label: string, url: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId } });
    if (!task) throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found" });
    return this.prisma.taskLink.create({ data: { workspaceId, taskId, label, url } });
  }

  async removeLink(taskId: string, linkId: string, workspaceId: string) {
    const link = await this.prisma.taskLink.findFirst({ where: { id: linkId, taskId, workspaceId } });
    if (!link) throw new NotFoundException({ code: "NOT_FOUND", message: "Link not found" });
    await this.prisma.taskLink.delete({ where: { id: linkId, workspaceId } });
  }

  // --- Today -----------------------------------------------------------

  // NOTE: `_timezone` is accepted for API-shape completeness per PROJECT_PLAN.md
  // §2.8d/§7#11 but "today"/"endOfToday" below use UTC calendar boundaries
  // rather than full IANA workspace-timezone conversion (see final report).
  async today(workspaceId: string, _timezone: string) {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const [tasks, projects] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId, archivedAt: null, status: { not: "DONE" } },
      }),
      this.prisma.project.findMany({ where: { workspaceId, archivedAt: null } }),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));

    const taskIds = tasks.map((t) => t.id);
    const blockedIds = await this.computeLiveBlockedSet(taskIds, workspaceId);

    const waiting: typeof tasks = [];
    const actionable: { task: (typeof tasks)[number]; reason: ActionableReason | null }[] = [];

    for (const task of tasks) {
      const project = projectById.get(task.projectId);
      if (!project) continue;
      const isBlockedLive = blockedIds.has(task.id);

      if (task.status === "WAITING") {
        waiting.push(task);
        continue;
      }

      const actionableInput = {
        archivedAt: task.archivedAt,
        status: task.status,
        isBlockedLive,
        dueDate: task.dueDate,
        surfacedForDate: task.surfacedForDate,
        priority: task.priority,
      };
      if (isTaskActionable(actionableInput, project, today, endOfToday)) {
        const reason = classifyActionableReason(actionableInput, today, endOfToday);
        actionable.push({ task, reason });
      }
    }

    const capped = capNextPriorityBackfill(actionable, 5);
    capped.sort((a, b) => compareActionableTasks(a.task, b.task, endOfToday));

    return {
      actionable: capped.map((a) => a.task),
      waiting,
    };
  }

  // --- Internal helpers ------------------------------------------------

  private async computeLiveBlockedSet(taskIds: string[], workspaceId: string): Promise<Set<string>> {
    if (taskIds.length === 0) return new Set();
    const blockingDeps = await this.prisma.taskDependency.findMany({
      where: {
        workspaceId,
        taskId: { in: taskIds },
        dependsOn: { status: { not: "DONE" }, archivedAt: null },
      },
      select: { taskId: true },
    });
    return new Set(blockingDeps.map((d) => d.taskId));
  }

  /** Recomputes Task.isBlocked for a single task and fires TASK_BLOCKED/UNBLOCKED if it flipped. */
  private async recomputeBlocked(
    tx: Prisma.TransactionClient | typeof this.prisma,
    taskId: string,
    workspaceId: string,
    actorId: string | null,
  ) {
    const task = await tx.task.findFirst({ where: { id: taskId, workspaceId } });
    if (!task) return;
    const openBlockerCount = await tx.taskDependency.count({
      where: { taskId, workspaceId, dependsOn: { status: { not: "DONE" }, archivedAt: null } },
    });
    const isBlocked = openBlockerCount > 0;
    if (isBlocked === task.isBlocked) return;

    await tx.task.update({ where: { id: taskId, workspaceId }, data: { isBlocked } });
    await this.activity.record(
      {
        workspaceId,
        projectId: task.projectId,
        actorId,
        type: isBlocked ? "TASK_BLOCKED" : "TASK_UNBLOCKED",
        entityType: "Task",
        entityId: taskId,
        summary: `Task "${task.title}" ${isBlocked ? "blocked" : "unblocked"}`,
      },
      tx,
    );
  }

  /** Recomputes isBlocked for every task that depends on `prerequisiteTaskId`. */
  private async recomputeDependentsBlocked(
    tx: Prisma.TransactionClient,
    prerequisiteTaskId: string,
    workspaceId: string,
    actorId: string | null,
  ) {
    const dependents = await tx.taskDependency.findMany({
      where: { dependsOnTaskId: prerequisiteTaskId, workspaceId },
      select: { taskId: true },
    });
    for (const dep of dependents) {
      await this.recomputeBlocked(tx, dep.taskId, workspaceId, actorId);
    }
  }

  private async createNextOccurrence(
    tx: Prisma.TransactionClient,
    completedTask: Prisma.TaskGetPayload<Record<string, never>>,
    workspaceId: string,
    actorId: string,
  ) {
    const nextDue = computeNextDueDate({
      anchor: completedTask.recurrenceAnchor ?? "DUE_DATE",
      unit: completedTask.recurrenceUnit!,
      interval: completedTask.recurrenceInterval!,
      previousDueDate: completedTask.dueDate,
      completedAt: completedTask.completedAt ?? new Date(),
      today: new Date(),
    });

    if (shouldStopRecurrence(nextDue, completedTask.recurrenceEndsAt)) return;

    const nextOccurrenceIndex = (completedTask.occurrenceIndex ?? 0) + 1;

    try {
      const created = await tx.task.create({
        data: {
          workspaceId,
          projectId: completedTask.projectId,
          milestoneId: completedTask.milestoneId,
          title: completedTask.title,
          description: completedTask.description,
          category: completedTask.category,
          priority: completedTask.priority,
          status: "NEXT",
          dueDate: nextDue,
          estimatedHours: completedTask.estimatedHours,
          tags: completedTask.tags,
          recurrenceUnit: completedTask.recurrenceUnit,
          recurrenceInterval: completedTask.recurrenceInterval,
          recurrenceAnchor: completedTask.recurrenceAnchor,
          recurrenceEndsAt: completedTask.recurrenceEndsAt,
          recurrenceSeriesId: completedTask.recurrenceSeriesId,
          occurrenceIndex: nextOccurrenceIndex,
        },
      });
      await this.activity.record(
        {
          workspaceId,
          projectId: completedTask.projectId,
          actorId,
          type: "TASK_RECURRED",
          entityType: "Task",
          entityId: created.id,
          summary: `Recurring task "${created.title}" created for its next occurrence`,
        },
        tx,
      );
    } catch (err: any) {
      // Unique violation on (recurrenceSeriesId, occurrenceIndex): a retried
      // completion already generated this occurrence. Swallow it.
      if (err?.code !== "P2002") throw err;
    }
  }
}
