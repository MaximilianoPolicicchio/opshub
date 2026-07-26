import { Module } from "@nestjs/common";
import { TimeEntriesService } from "./time-entries.service";
import { TimeReportsService } from "./reports.service";
import { TimeEntriesController } from "./time-entries.controller";
import { ActivityModule } from "../activity/activity.module";
import { BudgetsModule } from "../budgets/budgets.module";

@Module({
  imports: [ActivityModule, BudgetsModule],
  providers: [TimeEntriesService, TimeReportsService],
  controllers: [TimeEntriesController],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
