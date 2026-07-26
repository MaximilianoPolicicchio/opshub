import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { WebhookDispatcherService } from "../automations/webhook-dispatcher.service";
import { evaluateProjectHealth, HealthEvalCounts } from "./project-health.logic";

/** Injected-interface boundary: tasks module depends on this, never on Prisma directly for health. */
export abstract class IProjectHealthEvaluator {
  abstract evaluate(projectId: string, workspaceId: string, tx?: Prisma.TransactionClient): Promise<void>;
}

@Injectable()
export class ProjectHealthService implements IProjectHealthEvaluator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  /** Re-evaluates one project's health and persists + fires events if it changed. */
  async evaluate(projectId: string, workspaceId: string, tx: Prisma.TransactionClient | PrismaClient = this.prisma): Promise<void> {
    const project = await tx.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) return;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [highBlockedOpen, highWaitingAll, highOverdue, overdueOpen, budget] = await Promise.all([
      tx.task.count({
        where: {
          projectId,
          workspaceId,
          archivedAt: null,
          status: { not: "DONE" },
          priority: { in: ["CRITICAL", "HIGH"] },
          isBlocked: true,
        },
      }),
      tx.task.findMany({
        where: { projectId, workspaceId, archivedAt: null, status: "WAITING", priority: { in: ["CRITICAL", "HIGH"] } },
        select: { updatedAt: true },
      }),
      tx.task.count({
        where: {
          projectId,
          workspaceId,
          archivedAt: null,
          status: { not: "DONE" },
          priority: { in: ["CRITICAL", "HIGH"] },
          dueDate: { lt: startOfToday },
        },
      }),
      tx.task.count({
        where: { projectId, workspaceId, archivedAt: null, status: { not: "DONE" }, dueDate: { lt: startOfToday } },
      }),
      tx.projectBudget.findFirst({ where: { projectId, workspaceId } }),
    ]);

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const highPriorityWaitingStale = highWaitingAll.filter((t) => t.updatedAt < sevenDaysAgo).length;

    let budgetBurnPercent: number | null = null;
    if (budget && budget.billingModel !== "INTERNAL") {
      // Lightweight burn estimate for health purposes only; the authoritative
      // calculation lives in BudgetCalculatorService and is used for the UI/alerts.
      budgetBurnPercent = await this.estimateBurnPercent(tx, budget);
    }

    const counts: HealthEvalCounts = {
      highPriorityBlockedOpen: highBlockedOpen,
      highPriorityWaitingStale,
      highPriorityOverdue: highOverdue,
      overdueOpen,
    };

    const result = evaluateProjectHealth({
      status: project.status,
      counts,
      budgetBurnPercent,
      lastActivityAt: project.lastActivityAt,
      now,
    });

    if (result.health === project.health) {
      // Still refresh reason/evaluatedAt for observability, but no event.
      await tx.project.update({
        where: { id: projectId, workspaceId },
        data: { healthReason: result.reason, healthEvaluatedAt: now },
      });
      return;
    }

    const from = project.health;
    await tx.project.update({
      where: { id: projectId, workspaceId },
      data: { health: result.health, healthReason: result.reason, healthEvaluatedAt: now },
    });

    await this.activity.record(
      {
        workspaceId,
        projectId,
        type: "PROJECT_HEALTH_CHANGED",
        entityType: "Project",
        entityId: projectId,
        summary: `Project health changed from ${from} to ${result.health}: ${result.reason}`,
        metadata: { from, to: result.health, reason: result.reason },
      },
      tx,
    );

    // Webhook dispatch happens after the transaction commits in practice;
    // fire-and-forget here is acceptable since AutomationRun records the attempt.
    void this.dispatcher.dispatchTrigger({
      workspaceId,
      trigger: "PROJECT_HEALTH_CHANGED",
      projectId,
      dedupeEntityId: `${projectId}:${result.health}`,
      payload: {
        from,
        to: result.health,
        reason: result.reason,
        openHighPriorityCount: counts.highPriorityOverdue + counts.highPriorityBlockedOpen,
        overdueCount: overdueOpen,
      },
    });
  }

  private async estimateBurnPercent(tx: Prisma.TransactionClient | PrismaClient, budget: {
    id: string;
    projectId: string;
    billingModel: string;
    budgetAmount: Prisma.Decimal | null;
    hourlyRate: Prisma.Decimal | null;
    estimatedHours: Prisma.Decimal | null;
    startDate: Date | null;
    endDate: Date | null;
  }): Promise<number | null> {
    const entries = await tx.timeEntry.findMany({
      where: {
        projectId: budget.projectId,
        endTime: { not: null },
        ...(budget.startDate ? { startTime: { gte: budget.startDate } } : {}),
        ...(budget.endDate ? { startTime: { lt: new Date(budget.endDate.getTime() + 86400000) } } : {}),
      },
      select: { durationMinutes: true, billable: true },
    });
    const trackedMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
    const billableMinutes = entries.filter((e) => e.billable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
    const trackedHours = trackedMinutes / 60;
    const billableHours = billableMinutes / 60;

    let trackedValue: number | null = null;
    if (budget.billingModel === "HOURLY" && budget.hourlyRate) {
      trackedValue = billableHours * Number(budget.hourlyRate);
    } else if (budget.billingModel === "FIXED_PRICE" && budget.budgetAmount && budget.estimatedHours && Number(budget.estimatedHours) > 0) {
      trackedValue = billableHours * (Number(budget.budgetAmount) / Number(budget.estimatedHours));
    }

    const valueBurnPercent =
      trackedValue !== null && budget.budgetAmount && Number(budget.budgetAmount) > 0
        ? (trackedValue / Number(budget.budgetAmount)) * 100
        : null;
    const hoursBurnPercent =
      budget.estimatedHours && Number(budget.estimatedHours) > 0 ? (trackedHours / Number(budget.estimatedHours)) * 100 : null;

    return valueBurnPercent ?? hoursBurnPercent ?? 0;
  }
}
