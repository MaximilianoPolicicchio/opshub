import { Injectable, NotFoundException } from "@nestjs/common";
import { AutomationRunStatus, AutomationTrigger, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { WebhookDispatcherService } from "./webhook-dispatcher.service";

@Injectable()
export class AutomationRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  async list(
    workspaceId: string,
    filters: { automationId?: string; status?: AutomationRunStatus; projectId?: string; from?: Date; to?: Date },
    page = 1,
    pageSize = 50,
  ) {
    const where: Prisma.AutomationRunWhereInput = {
      workspaceId,
      ...(filters.automationId ? { automationId: filters.automationId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.from || filters.to
        ? { startedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.automationRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.automationRun.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  async findOne(id: string, workspaceId: string) {
    const run = await this.prisma.automationRun.findFirst({ where: { id, workspaceId } });
    if (!run) throw new NotFoundException({ code: "NOT_FOUND", message: "Automation run not found" });
    return run;
  }

  async retry(id: string, workspaceId: string) {
    const run = await this.findOne(id, workspaceId);
    return this.dispatcher.resend(
      run.automationId,
      workspaceId,
      run.requestPayload,
      run.trigger as AutomationTrigger,
      run.projectId,
    );
  }
}
