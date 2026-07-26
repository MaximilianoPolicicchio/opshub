import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { AutomationRunStatus, AutomationTrigger, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ActivityService } from "../activity/activity.service";

export interface DispatchEventInput {
  workspaceId: string;
  trigger: AutomationTrigger;
  projectId?: string | null;
  payload: Record<string, unknown>;
  /** Entity id used to build the dedupeKey for auto-triggered events. Omit for manual/simulated. */
  dedupeEntityId?: string;
  /** Force a SIMULATED run regardless of config (used by "Simulate run" in the UI). */
  forceSimulate?: boolean;
}

interface WorkspaceEnvelopeInput {
  id: string;
  name: string;
  slug: string;
}

interface ProjectEnvelopeInput {
  id: string;
  name: string;
  type: string;
  status: string;
  health: string;
}

const EVENT_TYPE_BY_TRIGGER: Record<AutomationTrigger, string> = {
  TASK_OVERDUE_HIGH_PRIORITY: "task.overdue.high_priority",
  PROJECT_HEALTH_CHANGED: "project.health.changed",
  BUDGET_THRESHOLD_REACHED: "budget.threshold.reached",
  WEEKLY_REVIEW_GENERATED: "weekly_review.generated",
  MANUAL: "manual",
};

/**
 * Leaf service: dispatches the outbound n8n webhook per §2.9 of the plan and
 * records exactly one AutomationRun per attempt. Never imports other feature
 * modules besides the activity leaf service.
 */
@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Finds all enabled automations in the workspace (and project, if set) that
   * listen to this trigger, and dispatches one webhook attempt per automation.
   */
  async dispatchTrigger(input: DispatchEventInput): Promise<void> {
    const automations = await this.prisma.automation.findMany({
      where: {
        workspaceId: input.workspaceId,
        trigger: input.trigger,
        archivedAt: null,
        OR: [{ projectId: null }, { projectId: input.projectId ?? undefined }],
      },
    });

    for (const automation of automations) {
      await this.runOne(automation, input);
    }
  }

  /** Used by "Simulate run" (always SIMULATED). */
  async simulate(automationId: string, workspaceId: string, payload: Record<string, unknown>, trigger: AutomationTrigger, projectId: string | null) {
    const automation = await this.prisma.automation.findFirst({ where: { id: automationId, workspaceId } });
    if (!automation) return null;
    return this.runOne(automation, { workspaceId, trigger, projectId, payload, forceSimulate: true });
  }

  /**
   * Re-sends a previously recorded envelope as a brand new run
   * (POST /automation-runs/:id/retry). Not forced to simulate: if a webhook
   * URL is configured this is a real network attempt.
   */
  async resend(automationId: string, workspaceId: string, storedEnvelope: any, trigger: AutomationTrigger, projectId: string | null) {
    const automation = await this.prisma.automation.findFirst({ where: { id: automationId, workspaceId } });
    if (!automation) return null;

    const webhookUrl = this.config.get<string>("N8N_WEBHOOK_URL");
    const runId = crypto.randomUUID();
    const requestPayload = { ...storedEnvelope, eventId: runId, occurredAt: new Date().toISOString() };

    if (!webhookUrl) {
      return this.recordRun(automation, { workspaceId, trigger, projectId, payload: {} }, EVENT_TYPE_BY_TRIGGER[trigger], "SIMULATED", true, null, requestPayload, null, null, null, null, runId);
    }

    const start = Date.now();
    const result = await this.sendWithRetries(webhookUrl, requestPayload);
    const durationMs = Date.now() - start;
    const status: AutomationRunStatus = result.ok ? "SUCCESS" : "FAILED";
    const run = await this.recordRun(
      automation,
      { workspaceId, trigger, projectId, payload: {} },
      EVENT_TYPE_BY_TRIGGER[trigger],
      status,
      false,
      null,
      requestPayload,
      result.status ?? null,
      result.body ?? null,
      result.ok ? null : result.error ?? "Unknown error",
      durationMs,
      runId,
    );
    if (run && status === "FAILED") {
      await this.activity.record({
        workspaceId,
        projectId: projectId ?? null,
        type: "AUTOMATION_RUN",
        entityType: "AutomationRun",
        entityId: run.id,
        summary: `Automation "${(automation as any).name ?? automation.id}" failed to run`,
        metadata: { errorMessage: result.error },
      });
    }
    return run;
  }

  private async runOne(
    automation: { id: string; workspaceId: string; projectId: string | null; enabled: boolean; config: Prisma.JsonValue },
    input: DispatchEventInput,
  ) {
    const eventType = EVENT_TYPE_BY_TRIGGER[input.trigger];
    const webhookUrl = this.config.get<string>("N8N_WEBHOOK_URL");
    const dedupeKey = input.dedupeEntityId
      ? `${input.trigger}:${input.dedupeEntityId}:${new Date().toISOString().slice(0, 10)}`
      : null;

    if (!automation.enabled && !input.forceSimulate) {
      return this.recordRun(automation, input, eventType, "SKIPPED", false, dedupeKey, null, null, null, null, null, crypto.randomUUID());
    }

    const [workspace, project] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: input.workspaceId } }),
      input.projectId
        ? this.prisma.project.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId } })
        : Promise.resolve(null),
    ]);
    if (!workspace) return null;

    const runId = crypto.randomUUID();
    const requestPayload = this.buildEnvelope(workspace, project, automation, eventType, input, runId);

    if (input.forceSimulate || !webhookUrl) {
      return this.recordRun(automation, input, eventType, "SIMULATED", true, null, requestPayload, null, null, null, null, runId);
    }

    const start = Date.now();
    const result = await this.sendWithRetries(webhookUrl, requestPayload);
    const durationMs = Date.now() - start;

    if (result.ok) {
      return this.recordRun(
        automation,
        input,
        eventType,
        "SUCCESS",
        false,
        dedupeKey,
        requestPayload,
        result.status ?? null,
        result.body ?? null,
        null,
        durationMs,
        runId,
      );
    }

    const run = await this.recordRun(
      automation,
      input,
      eventType,
      "FAILED",
      false,
      dedupeKey,
      requestPayload,
      result.status ?? null,
      result.body ?? null,
      result.error ?? "Unknown error",
      durationMs,
      runId,
    );

    if (run) {
      await this.activity.record({
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        type: "AUTOMATION_RUN",
        entityType: "AutomationRun",
        entityId: run.id,
        summary: `Automation "${(automation as any).name ?? automation.id}" failed to run`,
        metadata: { errorMessage: result.error },
      });
    }
    return run;
  }

  private buildEnvelope(
    workspace: WorkspaceEnvelopeInput,
    project: ProjectEnvelopeInput | null,
    automation: { id: string; projectId: string | null },
    eventType: string,
    input: DispatchEventInput,
    runId: string,
  ) {
    return {
      eventType,
      eventId: runId,
      occurredAt: new Date().toISOString(),
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      project: project
        ? { id: project.id, name: project.name, type: project.type, status: project.status, health: project.health }
        : null,
      automation: { id: automation.id, name: (automation as any).name, trigger: input.trigger },
      simulated: !!input.forceSimulate,
      payload: input.payload,
    };
  }

  private async recordRun(
    automation: { id: string; workspaceId: string; projectId: string | null },
    input: DispatchEventInput,
    _eventType: string,
    status: AutomationRunStatus,
    simulated: boolean,
    dedupeKey: string | null,
    requestPayload: unknown,
    responseStatus: number | null,
    responseBody: string | null,
    errorMessage: string | null,
    durationMs: number | null,
    runId: string,
  ) {
    try {
      const run = await this.prisma.automationRun.create({
        data: {
          id: runId,
          workspaceId: input.workspaceId,
          automationId: automation.id,
          projectId: input.projectId ?? null,
          trigger: input.trigger,
          status,
          simulated,
          requestPayload: (requestPayload ?? {}) as Prisma.InputJsonValue,
          responseStatus,
          responseBody: responseBody ? responseBody.slice(0, 2000) : null,
          errorMessage,
          durationMs,
          dedupeKey,
        },
      });
      await this.prisma.automation.update({
        where: { id: automation.id, workspaceId: automation.workspaceId },
        data: { lastRunAt: new Date() },
      });
      return run;
    } catch (err: any) {
      // Unique violation on (automationId, dedupeKey) == "already fired today"; drop silently.
      if (err?.code === "P2002") {
        this.logger.debug(`Deduped automation run for ${automation.id} / ${dedupeKey}`);
        return null;
      }
      throw err;
    }
  }

  private async sendWithRetries(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
    const secret = this.config.get<string>("N8N_WEBHOOK_SECRET");
    const timeoutMs = this.config.get<number>("N8N_WEBHOOK_TIMEOUT_MS") ?? 5000;
    const rawBody = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) {
      const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
      headers["X-OpsHub-Signature"] = `sha256=${hmac}`;
    }

    const delays = [0, 1000, 4000];
    let lastError: string | undefined;
    let lastStatus: number | undefined;
    let lastBody: string | undefined;

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { method: "POST", headers, body: rawBody, signal: controller.signal });
        clearTimeout(timeout);
        const body = await res.text().catch(() => "");
        lastStatus = res.status;
        lastBody = body;
        if (res.status >= 200 && res.status < 300) {
          return { ok: true, status: res.status, body };
        }
        if (res.status >= 500) {
          lastError = `HTTP ${res.status}`;
          continue; // retry on 5xx
        }
        // Non-5xx failure: no retry.
        return { ok: false, status: res.status, body, error: `HTTP ${res.status}` };
      } catch (err: any) {
        lastError = err?.message ?? "Network error";
        continue; // retry on network error / timeout
      }
    }
    return { ok: false, status: lastStatus, body: lastBody, error: lastError };
  }
}
