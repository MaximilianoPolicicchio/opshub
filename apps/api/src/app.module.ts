import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { JwtAuthGuard, WorkspaceGuard, RolesGuard, ConditionalThrottlerGuard } from "./common/guards";

import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { MilestonesModule } from "./modules/milestones/milestones.module";
import { NotesModule } from "./modules/notes/notes.module";
import { TimeEntriesModule } from "./modules/time-entries/time-entries.module";
import { BudgetsModule } from "./modules/budgets/budgets.module";
import { CostsModule } from "./modules/costs/costs.module";
import { AutomationsModule } from "./modules/automations/automations.module";
import { ActivityModule } from "./modules/activity/activity.module";
import { WeeklyReviewModule } from "./modules/weekly-review/weekly-review.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { SystemModule } from "./modules/system/system.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 20 }] }),
    AuthModule,
    UsersModule,
    WorkspacesModule,
    ProjectsModule,
    TasksModule,
    MilestonesModule,
    NotesModule,
    TimeEntriesModule,
    BudgetsModule,
    CostsModule,
    AutomationsModule,
    ActivityModule,
    WeeklyReviewModule,
    SchedulerModule,
    SystemModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: WorkspaceGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ConditionalThrottlerGuard },
  ],
})
export class AppModule {}
