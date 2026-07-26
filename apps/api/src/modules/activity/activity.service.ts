import { Injectable } from "@nestjs/common";
import { ActivityType, Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface RecordActivityInput {
  workspaceId: string;
  projectId?: string | null;
  actorId?: string | null;
  type: ActivityType;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Leaf service: writes ActivityEvent rows and bumps Project.lastActivityAt.
 * Every other module calls into this; it never imports back into them.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records one activity event and bumps the parent project's lastActivityAt,
   * within the given transaction client (or the root client if none passed).
   */
  async record(
    input: RecordActivityInput,
    tx: Prisma.TransactionClient | PrismaClient = this.prisma,
  ): Promise<void> {
    await tx.activityEvent.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        actorId: input.actorId ?? null,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (input.projectId) {
      await tx.project.update({
        where: { id: input.projectId, workspaceId: input.workspaceId },
        data: { lastActivityAt: new Date() },
      });
    }
  }

  async listForWorkspace(
    workspaceId: string,
    filters: { projectId?: string; type?: ActivityType; since?: Date },
    page = 1,
    pageSize = 50,
  ) {
    const where: Prisma.ActivityEventWhereInput = {
      workspaceId,
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.since ? { createdAt: { gte: filters.since } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityEvent.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  async listForProject(projectId: string, workspaceId: string, page = 1, pageSize = 50) {
    const where: Prisma.ActivityEventWhereInput = { projectId, workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityEvent.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }
}
