import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { SchedulerService } from "./scheduler.service";
import { ProjectsModule } from "../projects/projects.module";
import { AutomationsModule } from "../automations/automations.module";
import { BudgetsModule } from "../budgets/budgets.module";
import { WeeklyReviewModule } from "../weekly-review/weekly-review.module";

@Module({
  imports: [ScheduleModule.forRoot(), ProjectsModule, AutomationsModule, BudgetsModule, WeeklyReviewModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
