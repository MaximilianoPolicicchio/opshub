import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { WorkspaceId, CurrentUser } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { TimeEntriesService } from "./time-entries.service";
import { TimeReportsService } from "./reports.service";

@Controller("time-entries")
export class TimeEntriesController {
  constructor(
    private readonly timeEntries: TimeEntriesService,
    private readonly reports: TimeReportsService,
  ) {}

  @Get()
  list(
    @WorkspaceId() workspaceId: string,
    @Query("projectId") projectId?: string,
    @Query("taskId") taskId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("billable") billable?: string,
  ) {
    return this.timeEntries.list(workspaceId, {
      projectId,
      taskId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      billable: billable === undefined ? undefined : billable === "true",
    });
  }

  @Get("active")
  active(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser) {
    return this.timeEntries.getActive(user.id, workspaceId);
  }

  @Post()
  create(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Body() body: any) {
    return this.timeEntries.createManual(user.id, workspaceId, body);
  }

  @Post("start")
  start(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Body() body: any) {
    return this.timeEntries.startTimer(user.id, workspaceId, body);
  }

  @Post("stop")
  stop(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Body() body: any) {
    return this.timeEntries.stopTimer(user.id, workspaceId, body);
  }

  @Get("reports")
  report(
    @WorkspaceId() workspaceId: string,
    @Query("groupBy") groupBy: "project" | "day" | "week" | "task" = "project",
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.report(workspaceId, groupBy, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Patch(":id")
  update(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.timeEntries.update(id, workspaceId, user.id, req.role, body);
  }

  @Delete(":id")
  remove(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Req() req: any, @Param("id") id: string) {
    return this.timeEntries.remove(id, workspaceId, user.id, req.role);
  }
}
