import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectHealthService } from "../projects/project-health.service";
import { WebhookDispatcherService } from "../automations/webhook-dispatcher.service";
import { BudgetAlertsService } from "../budgets/budget-alerts.service";
import { WeeklyReviewService } from "../weekly-review/weekly-review.service";

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly health: ProjectHealthService,
    private readonly dispatcher: WebhookDispatcherService,
    private readonly budgetAlerts: BudgetAlertsService,
    private readonly weeklyReview: WeeklyReviewService,
  ) {}

  private enabled(): boolean {
    return this.config.get<boolean>("SCHEDULER_ENABLED") ?? true;
  }

  /** Cron "star-slash-15 star star star star" — overdue scan: high-priority open tasks whose dueDate just passed. */
  @Cron("*/15 * * * *")
  async overdueScan() {
    if (!this.enabled()) return;
    this.logger.log("Running overdue scan");

    const now = new Date();
    const tasks = await this.prisma.task.findMany({
      where: {
        archivedAt: null,
        status: { not: "DONE" },
        priority: { in: ["CRITICAL", "HIGH"] },
        dueDate: { lt: now },
      },
    });

    for (const task of tasks) {
      const daysOverdue = task.dueDate ? Math.max(0, Math.floor((now.getTime() - task.dueDate.getTime()) / 86400000)) : 0;
      await this.dispatcher.dispatchTrigger({
        workspaceId: task.workspaceId,
        trigger: "TASK_OVERDUE_HIGH_PRIORITY",
        projectId: task.projectId,
        dedupeEntityId: task.id,
        payload: {
          taskId: task.id,
          title: task.title,
          priority: task.priority,
          category: task.category,
          status: task.status,
          dueDate: task.dueDate,
          daysOverdue,
          assigneeEmail: null,
        },
      });
    }
  }

  /** 0 3 * * * — nightly repair: isBlocked, project health, budget burn/alerts. */
  @Cron("0 3 * * *")
  async nightlyRepair() {
    if (!this.enabled()) return;
    this.logger.log("Running nightly repair");

    const tasks = await this.prisma.task.findMany({ where: { archivedAt: null } });
    for (const task of tasks) {
      const openBlockerCount = await this.prisma.taskDependency.count({
        where: { taskId: task.id, dependsOn: { status: { not: "DONE" }, archivedAt: null } },
      });
      const isBlocked = openBlockerCount > 0;
      if (isBlocked !== task.isBlocked) {
        await this.prisma.task.update({ where: { id: task.id }, data: { isBlocked } });
      }
    }

    const projects = await this.prisma.project.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "MAINTENANCE"] } } });
    for (const project of projects) {
      await this.health.evaluate(project.id, project.workspaceId);
      await this.budgetAlerts.evaluateAlerts(project.id, project.workspaceId);
    }
  }

  /** 0 9 * * 1 — weekly review generation (Monday 09:00). */
  @Cron("0 9 * * 1")
  async weeklyReviewGeneration() {
    if (!this.enabled()) return;
    this.logger.log("Generating weekly reviews");

    const workspaces = await this.prisma.workspace.findMany();
    for (const workspace of workspaces) {
      await this.weeklyReview.generate(workspace.id);
    }
  }
}
