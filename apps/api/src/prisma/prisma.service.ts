import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Multi-tenant isolation note.
 *
 * An earlier version of this file exposed a `forWorkspace(workspaceId)` Prisma
 * client extension that injected `where.workspaceId` on tenant-owned models. It
 * was never adopted by any service, which made it worse than useless: the
 * README described it as an active layer of defence while it was dead code.
 *
 * Isolation is now explicit and uniform instead. Every service filters on
 * `workspaceId`, reads use `findFirst({ id, workspaceId })` so foreign ids 404
 * rather than 403, and every `update`/`delete` carries `workspaceId` in its own
 * `where` so the mutation is authoritative rather than trusting a prior check.
 * `tenant-scoping.arch.spec.ts` fails the build if a write is added without it.
 *
 * The extension was dropped rather than wired up because making it genuinely
 * transparent requires an AsyncLocalStorage request context and returning an
 * extended client that every service must remember to use — the same
 * "remember to do the right thing" failure mode as explicit filtering, but
 * hidden. Explicit scoping plus a test that cannot be forgotten is the smaller,
 * more auditable mechanism. Postgres RLS is the real next step.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
