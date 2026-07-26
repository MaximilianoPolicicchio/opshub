import { Module } from "@nestjs/common";
import { AutomationsService } from "./automations.service";
import { AutomationRunsService } from "./automation-runs.service";
import { WebhookDispatcherService } from "./webhook-dispatcher.service";
import { AutomationsController } from "./automations.controller";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [ActivityModule],
  providers: [AutomationsService, AutomationRunsService, WebhookDispatcherService],
  controllers: [AutomationsController],
  exports: [WebhookDispatcherService, AutomationsService],
})
export class AutomationsModule {}
