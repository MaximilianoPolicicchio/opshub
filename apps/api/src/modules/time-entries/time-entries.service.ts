import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { BudgetAlertsService } from "../budgets/budget-alerts.service";
import { computeDurationMinutes, findOverlap } from "./overlap-detection.logic";

export interface StartTimerInput {
  projectId: string;
  taskId?: string | null;
  description?: string | null;
  billable?: boolean;
  onConflict?: "reject" | "stopPrevious";
}

export interface CreateTimeEntryInput {
  projectId: string;
  taskId?: string | null;
  startTime: string;
  endTime: string;
  billable?: boolean;
  description?: string | null;
}

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly budgetAlerts: BudgetAlertsService,
  ) {}

  async list(
    workspaceId: string,
    filters: { projectId?: string; taskId?: string; from?: Date; to?: Date; billable?: boolean },
  ) {
    return this.prisma.timeEntry.findMany({
      where: {
        workspaceId,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.taskId ? { taskId: filters.taskId } : {}),
        ...(filters.billable !== undefined ? { billable: filters.billable } : {}),
        ...(filters.from || filters.to
          ? { startTime: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
          : {}),
      },
      orderBy: { startTime: "desc" },
      // The Time view lists entries across projects, so it needs the names to
      // be useful at all — otherwise every row reads as an anonymous duration.
      include: {
        project: { select: { id: true, name: true, color: true } },
        task: { select: { id: true, title: true, category: true } },
      },
    });
  }

  async getActive(userId: string, workspaceId: string) {
    return this.prisma.timeEntry.findFirst({ where: { userId, workspaceId, endTime: null } });
  }

  async startTimer(userId: string, workspaceId: string, input: StartTimerInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, workspaceId } });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });

    return this.prisma.$transaction(async (tx) => {
      const running = await tx.timeEntry.findFirst({ where: { userId, endTime: null } });
      if (running) {
        if ((input.onConflict ?? "reject") === "reject") {
          throw new ConflictException({
            code: "TIMER_ALREADY_RUNNING",
            message: "A timer is already running",
            details: { runningEntry: running },
          });
        }
        // stopPrevious: stop it first.
        const stopped = await this.stopEntry(tx, running, new Date());
        await this.activity.record(
          {
            workspaceId,
            projectId: stopped.projectId,
            actorId: userId,
            type: "TIME_ENTRY_LOGGED",
            entityType: "TimeEntry",
            entityId: stopped.id,
            summary: `Time entry logged: ${stopped.durationMinutes} minutes`,
          },
          tx,
        );
        await this.budgetAlerts.evaluateAlerts(stopped.projectId, workspaceId);
      }

      try {
        return await tx.timeEntry.create({
          data: {
            workspaceId,
            projectId: input.projectId,
            taskId: input.taskId ?? null,
            userId,
            startTime: new Date(),
            billable: input.billable ?? false,
            description: input.description ?? null,
          },
        });
      } catch (err: any) {
        if (err?.code === "P2002") {
          throw new ConflictException({ code: "TIMER_ALREADY_RUNNING", message: "A timer is already running" });
        }
        throw err;
      }
    });
  }

  async stopTimer(userId: string, workspaceId: string, input: { id?: string | null; endTime?: string | null }) {
    const entry = input.id
      ? await this.prisma.timeEntry.findFirst({ where: { id: input.id, userId, workspaceId, endTime: null } })
      : await this.prisma.timeEntry.findFirst({ where: { userId, workspaceId, endTime: null } });

    if (!entry) throw new NotFoundException({ code: "NOT_FOUND", message: "No running timer found" });

    const endTime = input.endTime ? new Date(input.endTime) : new Date();
    if (endTime.getTime() <= entry.startTime.getTime()) {
      throw new UnprocessableEntityException({
        code: "INVALID_TIME_RANGE",
        message: "Stop time must be after the start time",
      });
    }

    const stopped = await this.prisma.$transaction(async (tx) => this.stopEntry(tx, entry, endTime));

    await this.activity.record({
      workspaceId,
      projectId: stopped.projectId,
      actorId: userId,
      type: "TIME_ENTRY_LOGGED",
      entityType: "TimeEntry",
      entityId: stopped.id,
      summary: `Time entry logged: ${stopped.durationMinutes} minutes`,
    });
    await this.budgetAlerts.evaluateAlerts(stopped.projectId, workspaceId);
    return stopped;
  }

  private async stopEntry(
    tx: Prisma.TransactionClient,
    // workspaceId is required so the UPDATE itself is workspace-scoped rather
    // than trusting the caller's earlier lookup.
    entry: { id: string; startTime: Date; workspaceId: string },
    endTime: Date,
  ) {
    const durationMinutes = computeDurationMinutes(entry.startTime, endTime);
    try {
      return await tx.timeEntry.update({
        where: { id: entry.id, workspaceId: entry.workspaceId },
        data: { endTime, durationMinutes },
      });
    } catch (err: any) {
      if (err?.code === "23P01" || err?.meta?.code === "23P01") {
        throw new UnprocessableEntityException({
          code: "TIME_ENTRY_OVERLAP",
          message: "This time range overlaps an existing entry",
        });
      }
      throw err;
    }
  }

  async createManual(userId: string, workspaceId: string, input: CreateTimeEntryInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, workspaceId } });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });

    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);
    if (endTime <= startTime) {
      throw new UnprocessableEntityException({ code: "INVALID_TIME_RANGE", message: "endTime must be after startTime" });
    }

    const existing = await this.prisma.timeEntry.findMany({
      where: { userId, endTime: { not: null } },
      select: { id: true, startTime: true, endTime: true },
    });
    const conflict = findOverlap({ startTime, endTime }, existing);
    if (conflict) {
      throw new UnprocessableEntityException({
        code: "TIME_ENTRY_OVERLAP",
        message: "This time range overlaps an existing entry",
        details: { conflictingEntryId: conflict.id },
      });
    }

    const durationMinutes = computeDurationMinutes(startTime, endTime);

    let entry;
    try {
      entry = await this.prisma.timeEntry.create({
        data: {
          workspaceId,
          projectId: input.projectId,
          taskId: input.taskId ?? null,
          userId,
          startTime,
          endTime,
          durationMinutes,
          billable: input.billable ?? false,
          description: input.description ?? null,
        },
      });
    } catch (err: any) {
      if (err?.code === "23P01" || err?.meta?.code === "23P01") {
        throw new UnprocessableEntityException({
          code: "TIME_ENTRY_OVERLAP",
          message: "This time range overlaps an existing entry",
        });
      }
      throw err;
    }

    await this.activity.record({
      workspaceId,
      projectId: entry.projectId,
      actorId: userId,
      type: "TIME_ENTRY_LOGGED",
      entityType: "TimeEntry",
      entityId: entry.id,
      summary: `Time entry logged: ${durationMinutes} minutes`,
    });
    await this.budgetAlerts.evaluateAlerts(entry.projectId, workspaceId);
    return entry;
  }

  async update(
    id: string,
    workspaceId: string,
    userId: string,
    role: string,
    input: Partial<CreateTimeEntryInput>,
  ) {
    const existing = await this.prisma.timeEntry.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Time entry not found" });
    if (role === "MEMBER" && existing.userId !== userId) {
      throw new ConflictException({ code: "FORBIDDEN", message: "Cannot edit another user's time entry" });
    }

    const startTime = input.startTime ? new Date(input.startTime) : existing.startTime;
    const endTime = input.endTime ? new Date(input.endTime) : existing.endTime;

    if (endTime && endTime <= startTime) {
      throw new UnprocessableEntityException({ code: "INVALID_TIME_RANGE", message: "endTime must be after startTime" });
    }

    if (endTime) {
      const others = await this.prisma.timeEntry.findMany({
        where: { userId: existing.userId, endTime: { not: null }, id: { not: id } },
        select: { id: true, startTime: true, endTime: true },
      });
      const conflict = findOverlap({ id, startTime, endTime }, others);
      if (conflict) {
        throw new UnprocessableEntityException({
          code: "TIME_ENTRY_OVERLAP",
          message: "This time range overlaps an existing entry",
          details: { conflictingEntryId: conflict.id },
        });
      }
    }

    const durationMinutes = endTime ? computeDurationMinutes(startTime, endTime) : null;

    let updated;
    try {
      updated = await this.prisma.timeEntry.update({
        where: { id, workspaceId },
        data: {
          startTime,
          endTime,
          durationMinutes,
          ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
          ...(input.billable !== undefined ? { billable: input.billable } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      });
    } catch (err: any) {
      if (err?.code === "23P01" || err?.meta?.code === "23P01") {
        throw new UnprocessableEntityException({
          code: "TIME_ENTRY_OVERLAP",
          message: "This time range overlaps an existing entry",
        });
      }
      throw err;
    }

    await this.budgetAlerts.evaluateAlerts(updated.projectId, workspaceId);
    return updated;
  }

  async remove(id: string, workspaceId: string, userId: string, role: string) {
    const existing = await this.prisma.timeEntry.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Time entry not found" });
    if (role === "MEMBER" && existing.userId !== userId) {
      throw new ConflictException({ code: "FORBIDDEN", message: "Cannot delete another user's time entry" });
    }
    await this.prisma.timeEntry.delete({ where: { id, workspaceId } });
    // Deleting time never resets alerts (they're historical), but we still
    // re-run evaluateAlerts in case burn crossed a NEW threshold going down
    // is a no-op by design (evaluateAlerts only ever adds rows).
  }
}
