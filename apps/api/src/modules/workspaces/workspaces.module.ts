import { Module } from "@nestjs/common";
import { WorkspacesService } from "./workspaces.service";
import { WorkspacesController } from "./workspaces.controller";
import { ActivityModule } from "../activity/activity.module";
import { TasksModule } from "../tasks/tasks.module";

@Module({
  imports: [ActivityModule, TasksModule],
  providers: [WorkspacesService],
  controllers: [WorkspacesController],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
