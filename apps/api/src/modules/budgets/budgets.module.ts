import { Module } from "@nestjs/common";
import { BudgetsService } from "./budgets.service";
import { BudgetCalculatorService } from "./budget-calculator.service";
import { BudgetAlertsService } from "./budget-alerts.service";
import { BudgetsController } from "./budgets.controller";
import { ActivityModule } from "../activity/activity.module";
import { AutomationsModule } from "../automations/automations.module";

@Module({
  imports: [ActivityModule, AutomationsModule],
  providers: [BudgetsService, BudgetCalculatorService, BudgetAlertsService],
  controllers: [BudgetsController],
  exports: [BudgetsService, BudgetCalculatorService, BudgetAlertsService],
})
export class BudgetsModule {}
