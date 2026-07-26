import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { WebhookDispatcherService } from "../automations/webhook-dispatcher.service";
import { BudgetCalculatorService } from "./budget-calculator.service";

@Injectable()
export class BudgetAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: BudgetCalculatorService,
    private readonly activity: ActivityService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  /**
   * Runs after every TimeEntry create/update/delete for the project and
   * after budget edits. PROJECT_PLAN.md §2.8h: fires each crossed threshold
   * once, ascending, via createMany+skipDuplicates against the unique index
   * on (projectBudgetId, threshold) -- that index *is* the dedupe.
   */
  async evaluateAlerts(projectId: string, workspaceId: string): Promise<void> {
    const budget = await this.prisma.projectBudget.findFirst({ where: { projectId, workspaceId } });
    if (!budget || budget.billingModel === "INTERNAL") return;

    const burn = await this.calculator.computeBurn(budget);
    const burnPercent = burn.burnPercent;

    const thresholds = [...budget.alertThresholds].sort((a, b) => a - b);
    for (const threshold of thresholds) {
      if (burnPercent.lt(threshold)) continue;

      const created = await this.prisma.budgetAlert.createMany({
        data: [
          {
            workspaceId,
            projectBudgetId: budget.id,
            threshold,
            burnPercentAtFire: burnPercent.toDecimalPlaces(2).toNumber(),
            amountAtFire: (burn.trackedValue ?? new Prisma.Decimal(0)).toNumber(),
          },
        ],
        skipDuplicates: true,
      });

      if (created.count === 1) {
        await this.activity.record({
          workspaceId,
          projectId,
          type: "BUDGET_THRESHOLD_REACHED",
          entityType: "ProjectBudget",
          entityId: budget.id,
          summary: `Budget crossed the ${threshold}% threshold`,
          metadata: { threshold, burnPercent: burnPercent.toNumber() },
        });

        void this.dispatcher.dispatchTrigger({
          workspaceId,
          trigger: "BUDGET_THRESHOLD_REACHED",
          projectId,
          dedupeEntityId: `${budget.id}:${threshold}`,
          payload: {
            budgetId: budget.id,
            threshold,
            burnPercent: burnPercent.toNumber(),
            trackedValue: burn.trackedValue?.toNumber() ?? null,
            budgetAmount: budget.budgetAmount?.toNumber() ?? null,
            currency: budget.currency,
            remainingAmount: burn.remainingAmount?.toNumber() ?? null,
            billingModel: budget.billingModel,
          },
        });
      }
    }
  }

  /**
   * Only editing budgetAmount/hourlyRate/estimatedHours prunes alerts whose
   * threshold is now above the new burnPercent, so they can fire again
   * meaningfully. Deleting time never resets alerts (they are historical).
   */
  async pruneStaleAlertsAfterBudgetEdit(projectId: string, workspaceId: string): Promise<void> {
    const budget = await this.prisma.projectBudget.findFirst({ where: { projectId, workspaceId } });
    if (!budget) return;
    const burn = await this.calculator.computeBurn(budget);
    await this.prisma.budgetAlert.deleteMany({
      where: { projectBudgetId: budget.id, threshold: { gt: burn.burnPercent.toNumber() } },
    });
  }

  async acknowledge(alertId: string, workspaceId: string) {
    const alert = await this.prisma.budgetAlert.findFirst({ where: { id: alertId, workspaceId } });
    if (!alert) return null;
    return this.prisma.budgetAlert.update({ where: { id: alertId }, data: { acknowledgedAt: new Date() } });
  }
}
