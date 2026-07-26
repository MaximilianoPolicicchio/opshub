import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AutomationRunStatus, AutomationTrigger } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { WorkspaceId, Roles } from "../../common/decorators";
import { AutomationsService } from "./automations.service";
import { AutomationRunsService } from "./automation-runs.service";

@Controller()
export class AutomationsController {
  constructor(
    private readonly automations: AutomationsService,
    private readonly runs: AutomationRunsService,
    private readonly config: ConfigService,
  ) {}

  @Get("automations")
  list(
    @WorkspaceId() workspaceId: string,
    @Query("projectId") projectId?: string,
    @Query("trigger") trigger?: AutomationTrigger,
    @Query("enabled") enabled?: string,
  ) {
    return this.automations.list(workspaceId, {
      projectId,
      trigger,
      enabled: enabled === undefined ? undefined : enabled === "true",
    });
  }

  @Post("automations")
  create(@WorkspaceId() workspaceId: string, @Body() body: any) {
    return this.automations.create(workspaceId, body);
  }

  @Patch("automations/:id")
  update(@WorkspaceId() workspaceId: string, @Param("id") id: string, @Body() body: any) {
    return this.automations.update(id, workspaceId, body);
  }

  @Delete("automations/:id")
  remove(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.automations.remove(id, workspaceId);
  }

  @Post("automations/:id/simulate")
  simulate(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.automations.simulate(id, workspaceId);
  }

  @Get("automations/webhook-status")
  webhookStatus(@WorkspaceId() _workspaceId: string) {
    const url = this.config.get<string>("N8N_WEBHOOK_URL");
    return {
      configured: !!url,
      url: url ? this.mask(url) : null,
    };
  }

  private mask(url: string): string {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.hostname}/***`;
    } catch {
      return "***";
    }
  }

  @Get("automation-runs")
  listRuns(
    @WorkspaceId() workspaceId: string,
    @Query("automationId") automationId?: string,
    @Query("status") status?: AutomationRunStatus,
    @Query("projectId") projectId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.runs.list(workspaceId, {
      automationId,
      status,
      projectId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get("automation-runs/:id")
  getRun(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.runs.findOne(id, workspaceId);
  }

  @Roles("OWNER", "ADMIN")
  @Post("automation-runs/:id/retry")
  retryRun(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.runs.retry(id, workspaceId);
  }
}
