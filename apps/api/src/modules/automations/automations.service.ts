import { Injectable, NotFoundException } from "@nestjs/common";
import { AutomationTrigger, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { WebhookDispatcherService } from "./webhook-dispatcher.service";

export interface CreateAutomationInput {
  projectId?: string | null;
  name: string;
  description?: string | null;
  trigger: AutomationTrigger;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  async list(workspaceId: string, filters: { projectId?: string; trigger?: AutomationTrigger; enabled?: boolean }) {
    return this.prisma.automation.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.trigger ? { trigger: filters.trigger } : {}),
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(workspaceId: string, input: CreateAutomationInput) {
    return this.prisma.automation.create({
      data: {
        workspaceId,
        projectId: input.projectId ?? null,
        name: input.name,
        description: input.description ?? null,
        trigger: input.trigger,
        enabled: input.enabled ?? true,
        config: (input.config ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, workspaceId: string, input: Partial<CreateAutomationInput>) {
    const existing = await this.prisma.automation.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Automation not found" });
    return this.prisma.automation.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.config !== undefined ? { config: input.config as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async remove(id: string, workspaceId: string) {
    const existing = await this.prisma.automation.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Automation not found" });
    await this.prisma.automation.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async simulate(id: string, workspaceId: string) {
    const automation = await this.prisma.automation.findFirst({ where: { id, workspaceId } });
    if (!automation) throw new NotFoundException({ code: "NOT_FOUND", message: "Automation not found" });

    const payload = await this.buildSamplePayload(automation.trigger, workspaceId, automation.projectId);
    const run = await this.dispatcher.simulate(id, workspaceId, payload, automation.trigger, automation.projectId);
    return run;
  }

  private async buildSamplePayload(
    trigger: AutomationTrigger,
    workspaceId: string,
    projectId: string | null,
  ): Promise<Record<string, unknown>> {
    switch (trigger) {
      case "TASK_OVERDUE_HIGH_PRIORITY": {
        const task = await this.prisma.task.findFirst({
          where: { workspaceId, archivedAt: null, priority: { in: ["CRITICAL", "HIGH"] } },
          orderBy: { dueDate: "asc" },
        });
        if (!task) return { note: "No high-priority tasks found to simulate with." };
        const daysOverdue = task.dueDate
          ? Math.max(0, Math.floor((Date.now() - task.dueDate.getTime()) / 86400000))
          : 0;
        return {
          taskId: task.id,
          title: task.title,
          priority: task.priority,
          category: task.category,
          status: task.status,
          dueDate: task.dueDate,
          daysOverdue,
          assigneeEmail: null,
        };
      }
      case "PROJECT_HEALTH_CHANGED": {
        const project = projectId
          ? await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } })
          : await this.prisma.project.findFirst({ where: { workspaceId } });
        return {
          from: "HEALTHY",
          to: project?.health ?? "HEALTHY",
          reason: project?.healthReason ?? "Simulated",
          openHighPriorityCount: 0,
          overdueCount: 0,
        };
      }
      case "BUDGET_THRESHOLD_REACHED": {
        const budget = projectId
          ? await this.prisma.projectBudget.findFirst({ where: { projectId, workspaceId } })
          : await this.prisma.projectBudget.findFirst({ where: { workspaceId } });
        return {
          budgetId: budget?.id ?? null,
          threshold: 50,
          burnPercent: 50,
          trackedValue: budget?.budgetAmount ? Number(budget.budgetAmount) / 2 : 0,
          budgetAmount: budget?.budgetAmount ?? null,
          currency: budget?.currency ?? "USD",
          remainingAmount: budget?.budgetAmount ? Number(budget.budgetAmount) / 2 : 0,
          billingModel: budget?.billingModel ?? "HOURLY",
        };
      }
      case "WEEKLY_REVIEW_GENERATED":
        return {
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          tasksCompleted: 0,
          hoursTracked: 0,
          billableHours: 0,
          projectsAtRisk: [],
          upcomingDue: [],
        };
      default:
        return {};
    }
  }
}
