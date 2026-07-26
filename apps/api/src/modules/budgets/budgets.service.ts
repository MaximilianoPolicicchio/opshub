import { Injectable, NotFoundException } from "@nestjs/common";
import { BillingModel } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";
import { BudgetCalculatorService } from "./budget-calculator.service";
import { BudgetAlertsService } from "./budget-alerts.service";

export interface UpsertBudgetInput {
  billingModel: BillingModel;
  currency?: string;
  budgetAmount?: number | null;
  hourlyRate?: number | null;
  estimatedHours?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  alertThresholds?: number[];
}

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly calculator: BudgetCalculatorService,
    private readonly alerts: BudgetAlertsService,
  ) {}

  async getForProject(projectId: string, workspaceId: string) {
    const budget = await this.prisma.projectBudget.findFirst({ where: { projectId, workspaceId } });
    if (!budget) return null;
    const burn = await this.calculator.computeBurn(budget);
    return { budget, burn };
  }

  async upsert(projectId: string, workspaceId: string, actorId: string, input: UpsertBudgetInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });

    const existing = await this.prisma.projectBudget.findFirst({ where: { projectId, workspaceId } });

    const data = {
      billingModel: input.billingModel,
      currency: input.currency ?? "USD",
      budgetAmount: input.budgetAmount ?? null,
      hourlyRate: input.hourlyRate ?? null,
      estimatedHours: input.estimatedHours ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      alertThresholds: input.alertThresholds ?? [50, 75, 90, 100],
    };

    const budget = existing
      ? await this.prisma.projectBudget.update({ where: { id: existing.id }, data })
      : await this.prisma.projectBudget.create({ data: { workspaceId, projectId, ...data } });

    if (!existing) {
      await this.activity.record({
        workspaceId,
        projectId,
        actorId,
        type: "BUDGET_CREATED",
        entityType: "ProjectBudget",
        entityId: budget.id,
        summary: `Budget created for ${project.name}`,
      });
    } else {
      // Editing amount/rate/estimatedHours prunes alerts above the new burn, per §2.8h.
      await this.alerts.pruneStaleAlertsAfterBudgetEdit(projectId, workspaceId);
    }

    await this.alerts.evaluateAlerts(projectId, workspaceId);
    return this.getForProject(projectId, workspaceId);
  }

  async remove(projectId: string, workspaceId: string) {
    const existing = await this.prisma.projectBudget.findFirst({ where: { projectId, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Budget not found" });
    await this.prisma.projectBudget.delete({ where: { id: existing.id } });
  }

  async listAlerts(projectId: string, workspaceId: string) {
    const budget = await this.prisma.projectBudget.findFirst({ where: { projectId, workspaceId } });
    if (!budget) return [];
    return this.prisma.budgetAlert.findMany({ where: { projectBudgetId: budget.id }, orderBy: { triggeredAt: "desc" } });
  }

  async acknowledgeAlert(alertId: string, workspaceId: string) {
    const result = await this.alerts.acknowledge(alertId, workspaceId);
    if (!result) throw new NotFoundException({ code: "NOT_FOUND", message: "Alert not found" });
    return result;
  }

  async financialOverview(workspaceId: string, from?: Date, to?: Date) {
    const projects = await this.prisma.project.findMany({
      where: { workspaceId, archivedAt: null },
      include: { budget: true },
    });

    const rows = [];
    const totalsByCurrency: Record<string, { budgetAmount: number; trackedValue: number; billingModel: Record<string, number> }> = {};

    for (const project of projects) {
      if (!project.budget) continue;
      const burn = await this.calculator.computeBurn(project.budget);
      rows.push({
        projectId: project.id,
        projectName: project.name,
        currency: project.budget.currency,
        billingModel: project.budget.billingModel,
        budgetAmount: project.budget.budgetAmount,
        trackedValue: burn.trackedValue,
        burnPercent: burn.burnPercent.toNumber(),
        billableHours: burn.billableHours.toNumber(),
        remaining: burn.remainingAmount,
        health: project.health,
      });

      if (project.budget.billingModel !== "INTERNAL") {
        const currency = project.budget.currency;
        totalsByCurrency[currency] = totalsByCurrency[currency] ?? {
          budgetAmount: 0,
          trackedValue: 0,
          billingModel: {},
        };
        totalsByCurrency[currency].budgetAmount += Number(project.budget.budgetAmount ?? 0);
        totalsByCurrency[currency].trackedValue += burn.trackedValue?.toNumber() ?? 0;
        totalsByCurrency[currency].billingModel[project.budget.billingModel] =
          (totalsByCurrency[currency].billingModel[project.budget.billingModel] ?? 0) + 1;
      }
    }

    return { rows, totalsByCurrency, from, to };
  }
}
