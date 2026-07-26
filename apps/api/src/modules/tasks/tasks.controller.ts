import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Priority, TaskCategory, TaskStatus } from "@prisma/client";
import { WorkspaceId, CurrentUser } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { TasksService } from "./tasks.service";
import { PrismaService } from "../../prisma/prisma.service";

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("tasks")
  list(
    @WorkspaceId() workspaceId: string,
    @Query("projectId") projectId?: string,
    @Query("status") status?: TaskStatus,
    @Query("priority") priority?: Priority,
    @Query("category") category?: TaskCategory,
    @Query("tag") tag?: string,
    @Query("dueBefore") dueBefore?: string,
    @Query("blocked") blocked?: string,
    @Query("q") q?: string,
  ) {
    return this.tasks.list(workspaceId, {
      projectId,
      status,
      priority,
      category,
      tag,
      dueBefore: dueBefore ? new Date(dueBefore) : undefined,
      blocked: blocked === undefined ? undefined : blocked === "true",
      q,
    });
  }

  @Get("tasks/today")
  async today(@WorkspaceId() workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    return this.tasks.today(workspaceId, workspace?.timezone ?? "UTC");
  }

  @Post("tasks")
  create(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Body() body: any) {
    return this.tasks.create(workspaceId, user.id, body);
  }

  @Get("tasks/:id")
  findOne(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.tasks.findOne(id, workspaceId);
  }

  @Patch("tasks/:id")
  update(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: any) {
    return this.tasks.update(id, workspaceId, user.id, body);
  }

  @Patch("tasks/:id/status")
  updateStatus(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body("status") status: TaskStatus,
  ) {
    return this.tasks.updateStatus(id, workspaceId, user.id, status);
  }

  @Patch("tasks/:id/position")
  updatePosition(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body() body: { status: TaskStatus; sortOrder: number },
  ) {
    return this.tasks.updatePosition(id, workspaceId, body.status, body.sortOrder);
  }

  @Delete("tasks/:id")
  remove(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.tasks.remove(id, workspaceId);
  }

  @Post("tasks/:id/surface")
  surface(@WorkspaceId() workspaceId: string, @Param("id") id: string, @Body("date") date: string) {
    return this.tasks.surface(id, workspaceId, date);
  }

  @Post("tasks/:id/dependencies")
  addDependency(@WorkspaceId() workspaceId: string, @Param("id") id: string, @Body("dependsOnTaskId") dependsOnTaskId: string) {
    return this.tasks.addDependency(id, workspaceId, dependsOnTaskId);
  }

  @Delete("tasks/:id/dependencies/:depId")
  removeDependency(@WorkspaceId() workspaceId: string, @Param("id") id: string, @Param("depId") depId: string) {
    return this.tasks.removeDependency(id, depId, workspaceId);
  }

  @Post("tasks/:id/links")
  addLink(@WorkspaceId() workspaceId: string, @Param("id") id: string, @Body() body: { label: string; url: string }) {
    return this.tasks.addLink(id, workspaceId, body.label, body.url);
  }

  @Delete("tasks/:id/links/:linkId")
  removeLink(@WorkspaceId() workspaceId: string, @Param("id") id: string, @Param("linkId") linkId: string) {
    return this.tasks.removeLink(id, linkId, workspaceId);
  }
}
