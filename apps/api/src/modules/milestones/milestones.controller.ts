import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { WorkspaceId, CurrentUser } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { MilestonesService } from "./milestones.service";

@Controller()
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Get("projects/:projectId/milestones")
  list(@WorkspaceId() workspaceId: string, @Param("projectId") projectId: string) {
    return this.milestones.listForProject(projectId, workspaceId);
  }

  @Post("projects/:projectId/milestones")
  create(@WorkspaceId() workspaceId: string, @Param("projectId") projectId: string, @Body() body: any) {
    return this.milestones.create(projectId, workspaceId, body);
  }

  @Patch("milestones/:id")
  update(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: any) {
    return this.milestones.update(id, workspaceId, user.id, body);
  }

  @Delete("milestones/:id")
  remove(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.milestones.remove(id, workspaceId);
  }
}
