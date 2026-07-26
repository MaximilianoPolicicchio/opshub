import { Injectable } from "@nestjs/common";
import { ProjectBudget } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { calculateBudgetBurn, BudgetCalculatorResult } from "./budget-calculator.logic";

@Injectable()
export class BudgetCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  async computeBurn(budget: ProjectBudget): Promise<BudgetCalculatorResult> {
    const entries = await this.prisma.timeEntry.findMany({
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

    return calculateBudgetBurn({
      billingModel: budget.billingModel,
      budgetAmount: budget.budgetAmount,
      hourlyRate: budget.hourlyRate,
      estimatedHours: budget.estimatedHours,
      trackedMinutes,
      billableMinutes,
    });
  }
}
