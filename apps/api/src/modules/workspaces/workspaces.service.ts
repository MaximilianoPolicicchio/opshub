import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { TasksService } from "../tasks/tasks.service";

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly tasks: TasksService,
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { workspace: true, role: true },
    });
    return memberships.map((m) => m.workspace);
  }

  async findOne(id: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { workspaceId: id, userId } });
    if (!membership) throw new ForbiddenException({ code: "NO_MEMBERSHIP", message: "Not a member of this workspace" });
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });
    if (!workspace) throw new NotFoundException({ code: "NOT_FOUND", message: "Workspace not found" });
    const members = await this.prisma.membership.findMany({
      where: { workspaceId: id },
      include: { user: { select: { id: true, name: true, email: true } }, role: true },
    });
    return { workspace, members };
  }

  async update(id: string, input: { name?: string; timezone?: string; weekStartsOn?: number; defaultCurrency?: string }) {
    return this.prisma.workspace.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.weekStartsOn !== undefined ? { weekStartsOn: input.weekStartsOn } : {}),
        ...(input.defaultCurrency !== undefined ? { defaultCurrency: input.defaultCurrency } : {}),
      },
    });
  }

  async members(id: string) {
    return this.prisma.membership.findMany({
      where: { workspaceId: id },
      include: { user: { select: { id: true, name: true, email: true } }, role: true },
    });
  }

  async activity(id: string, filters: { projectId?: string; type?: any; since?: Date }) {
    return this.activityService.listForWorkspace(id, filters);
  }

  async dashboard(id: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });
    const [{ actionable, waiting }, runningTimer, projectsNeedingAttention, todayEntries] = await Promise.all([
      this.tasks.today(id, workspace?.timezone ?? "UTC"),
      this.prisma.timeEntry.findFirst({ where: { workspaceId: id, endTime: null } }),
      this.prisma.project.findMany({
        where: { workspaceId: id, archivedAt: null, health: { in: ["NEEDS_ATTENTION", "BLOCKED"] } },
      }),
      this.prisma.timeEntry.findMany({
        where: { workspaceId: id, startTime: { gte: this.startOfDay() }, endTime: { not: null } },
        select: { durationMinutes: true },
      }),
    ]);

    const todaysHours = todayEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0) / 60;

    return {
      actionableTasks: actionable,
      waitingTasks: waiting,
      runningTimer,
      projectsNeedingAttention,
      todaysHours,
    };
  }

  private startOfDay(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
