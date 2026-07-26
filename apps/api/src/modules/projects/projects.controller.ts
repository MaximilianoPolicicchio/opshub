import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ProjectHealth, ProjectStatus, ProjectType, Priority } from "@prisma/client";
import { WorkspaceId, CurrentUser } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { ProjectsService } from "./projects.service";
import { ProjectTemplatesService } from "./project-templates.service";

@Controller()
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly templates: ProjectTemplatesService,
  ) {}

  @Get("projects")
  list(
    @WorkspaceId() workspaceId: string,
    @Query("status") status?: ProjectStatus,
    @Query("health") health?: ProjectHealth,
    @Query("type") type?: ProjectType,
    @Query("priority") priority?: Priority,
    @Query("tag") tag?: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.projects.list(
      workspaceId,
      { status, health, type, priority, tag, q },
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
    );
  }

  @Post("projects")
  create(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Body() body: any) {
    return this.projects.create(workspaceId, user.id, body);
  }

  @Get("project-templates")
  listTemplates(@WorkspaceId() workspaceId: string) {
    return this.templates.list(workspaceId);
  }

  @Get("projects/:id")
  findOne(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.projects.findOne(id, workspaceId);
  }

  @Patch("projects/:id")
  update(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: any) {
    return this.projects.update(id, workspaceId, user.id, body);
  }

  @Delete("projects/:id")
  remove(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.projects.archive(id, workspaceId);
  }

  @Post("projects/:id/archive")
  archive(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.projects.archive(id, workspaceId);
  }

  @Post("projects/:id/restore")
  restore(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.projects.restore(id, workspaceId);
  }

  @Get("projects/:id/overview")
  overview(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.projects.overview(id, workspaceId);
  }

  @Get("projects/:id/activity")
  activity(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.projects.listActivity(id, workspaceId);
  }
}
