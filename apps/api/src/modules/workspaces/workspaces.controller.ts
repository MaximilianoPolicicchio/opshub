import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ActivityType } from "@prisma/client";
import { CurrentUser, Roles } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Get(":id")
  findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.workspaces.findOne(id, user.id);
  }

  @Roles("ADMIN", "OWNER")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.workspaces.update(id, body);
  }

  @Roles("ADMIN", "OWNER")
  @Get(":id/members")
  members(@Param("id") id: string) {
    return this.workspaces.members(id);
  }

  @Get(":id/activity")
  activity(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
    @Query("type") type?: ActivityType,
    @Query("since") since?: string,
  ) {
    return this.workspaces.activity(id, { projectId, type, since: since ? new Date(since) : undefined });
  }

  @Get(":id/dashboard")
  dashboard(@Param("id") id: string) {
    return this.workspaces.dashboard(id);
  }
}
