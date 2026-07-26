import { Injectable, NotFoundException } from "@nestjs/common";
import { MilestoneStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async listForProject(projectId: string, workspaceId: string) {
    return this.prisma.milestone.findMany({ where: { projectId, workspaceId }, orderBy: { sortOrder: "asc" } });
  }

  async create(
    projectId: string,
    workspaceId: string,
    input: { title: string; description?: string | null; targetDate?: string | null; sortOrder?: number },
  ) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });
    return this.prisma.milestone.create({
      data: {
        workspaceId,
        projectId,
        title: input.title,
        description: input.description ?? null,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async update(
    id: string,
    workspaceId: string,
    actorId: string,
    input: { title?: string; description?: string | null; targetDate?: string | null; status?: MilestoneStatus; sortOrder?: number },
  ) {
    const existing = await this.prisma.milestone.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Milestone not found" });

    const completing = input.status === "DONE" && existing.status !== "DONE";

    const updated = await this.prisma.milestone.update({
      where: { id, workspaceId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.targetDate !== undefined ? { targetDate: input.targetDate ? new Date(input.targetDate) : null } : {}),
        ...(input.status !== undefined ? { status: input.status, ...(completing ? { completedAt: new Date() } : {}) } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });

    if (completing) {
      await this.activity.record({
        workspaceId,
        projectId: existing.projectId,
        actorId,
        type: "MILESTONE_COMPLETED",
        entityType: "Milestone",
        entityId: id,
        summary: `Milestone "${updated.title}" completed`,
      });
    }

    return updated;
  }

  async remove(id: string, workspaceId: string) {
    const existing = await this.prisma.milestone.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Milestone not found" });
    await this.prisma.milestone.delete({ where: { id, workspaceId } });
  }
}
