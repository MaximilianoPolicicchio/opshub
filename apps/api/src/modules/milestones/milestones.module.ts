import { Module } from "@nestjs/common";
import { MilestonesService } from "./milestones.service";
import { MilestonesController } from "./milestones.controller";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [ActivityModule],
  providers: [MilestonesService],
  controllers: [MilestonesController],
  exports: [MilestonesService],
})
export class MilestonesModule {}
