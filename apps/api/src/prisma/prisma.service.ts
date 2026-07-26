import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Models that carry a denormalized workspaceId and must always be scoped.
const TENANT_MODELS = new Set([
  "Project",
  "ProjectTemplate",
  "Milestone",
  "Task",
  "TaskDependency",
  "TaskLink",
  "Note",
  "TimeEntry",
  "ProjectBudget",
  "BudgetAlert",
  "Automation",
  "AutomationRun",
  "ActivityEvent",
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Returns a Prisma client extension scoped to a single workspace: every
   * findMany/findFirst/update/updateMany/delete/deleteMany/count on a
   * tenant-owned model gets `where.workspaceId` injected, and `create` gets
   * `data.workspaceId` injected. This is defense-in-depth on top of every
   * service explicitly filtering by workspaceId in its own queries.
   */
  forWorkspace(workspaceId: string) {
    return this.$extends({
      query: {
        $allModels: {
          async findMany({ model, args, query }) {
            if (TENANT_MODELS.has(model)) {
              args.where = { ...(args.where ?? {}), workspaceId };
            }
            return query(args);
          },
          async findFirst({ model, args, query }) {
            if (TENANT_MODELS.has(model)) {
              args.where = { ...(args.where ?? {}), workspaceId };
            }
            return query(args);
          },
          async count({ model, args, query }) {
            if (TENANT_MODELS.has(model)) {
              args.where = { ...(args.where ?? {}), workspaceId };
            }
            return query(args);
          },
          async update({ model, args, query }) {
            if (TENANT_MODELS.has(model)) {
              args.where = { ...(args.where ?? {}), workspaceId } as typeof args.where;
            }
            return query(args);
          },
          async updateMany({ model, args, query }) {
            if (TENANT_MODELS.has(model)) {
              args.where = { ...(args.where ?? {}), workspaceId };
            }
            return query(args);
          },
          async delete({ model, args, query }) {
            if (TENANT_MODELS.has(model)) {
              args.where = { ...(args.where ?? {}), workspaceId } as typeof args.where;
            }
            return query(args);
          },
          async deleteMany({ model, args, query }) {
            if (TENANT_MODELS.has(model)) {
              args.where = { ...(args.where ?? {}), workspaceId };
            }
            return query(args);
          },
          async create({ model, args, query }) {
            if (TENANT_MODELS.has(model)) {
              args.data = { ...(args.data ?? {}), workspaceId } as typeof args.data;
            }
            return query(args);
          },
        },
      },
    });
  }
}

export type ScopedPrismaClient = ReturnType<PrismaService["forWorkspace"]>;
