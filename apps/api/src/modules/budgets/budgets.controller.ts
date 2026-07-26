import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { WorkspaceId, CurrentUser, Roles } from "../../common/decorators";
import { RequestUser } from "../../common/decorators/current-user.decorator";
import { BudgetsService } from "./budgets.service";

@Controller()
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get("projects/:id/budget")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.budgets.getForProject(id, workspaceId);
  }

  @Roles("OWNER", "ADMIN")
  @Put("projects/:id/budget")
  upsert(@WorkspaceId() workspaceId: string, @CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: any) {
    return this.budgets.upsert(id, workspaceId, user.id, body);
  }

  @Roles("OWNER", "ADMIN")
  @Delete("projects/:id/budget")
  remove(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.budgets.remove(id, workspaceId);
  }

  @Get("projects/:id/budget/alerts")
  alerts(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.budgets.listAlerts(id, workspaceId);
  }

  @Post("budget-alerts/:id/acknowledge")
  acknowledge(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.budgets.acknowledgeAlert(id, workspaceId);
  }

  @Get("financial/overview")
  overview(@WorkspaceId() workspaceId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.budgets.financialOverview(workspaceId, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }
}
