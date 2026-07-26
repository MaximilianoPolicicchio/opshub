import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { TasksController } from "./tasks.controller";
import { ActivityModule } from "../activity/activity.module";
import { ProjectsModule } from "../projects/projects.module";
import { AutomationsModule } from "../automations/automations.module";

@Module({
  imports: [ActivityModule, ProjectsModule, AutomationsModule],
  providers: [TasksService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
