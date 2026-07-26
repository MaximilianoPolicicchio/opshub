import { Module } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { ProjectHealthService, IProjectHealthEvaluator } from "./project-health.service";
import { ProjectTemplatesService } from "./project-templates.service";
import { ProjectsController } from "./projects.controller";
import { ActivityModule } from "../activity/activity.module";
import { AutomationsModule } from "../automations/automations.module";

@Module({
  imports: [ActivityModule, AutomationsModule],
  providers: [
    ProjectsService,
    ProjectHealthService,
    { provide: IProjectHealthEvaluator, useExisting: ProjectHealthService },
    ProjectTemplatesService,
  ],
  controllers: [ProjectsController],
  exports: [ProjectsService, ProjectHealthService, IProjectHealthEvaluator, ProjectTemplatesService],
})
export class ProjectsModule {}
