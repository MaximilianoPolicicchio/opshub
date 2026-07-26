import { Module } from "@nestjs/common";
import { WeeklyReviewService } from "./weekly-review.service";
import { WeeklyReviewController } from "./weekly-review.controller";
import { ActivityModule } from "../activity/activity.module";
import { AutomationsModule } from "../automations/automations.module";

@Module({
  imports: [ActivityModule, AutomationsModule],
  providers: [WeeklyReviewService],
  controllers: [WeeklyReviewController],
  exports: [WeeklyReviewService],
})
export class WeeklyReviewModule {}
