# Project Command Center — Engineering Plan (v1)

Single-owner operations platform for a solo product builder managing multiple
concurrent software products, client work, automations, time and budgets.

Repo: `OpsHub` (pnpm workspace monorepo, empty at time of writing).

| Decision | Value |
| --- | --- |
| Package manager | pnpm workspaces (`pnpm-workspace.yaml`, Node 20 LTS) |
| Web | `apps/web` — Next.js 14 App Router, React, TypeScript |
| API | `apps/api` — NestJS 10, TypeScript |
| DB | PostgreSQL 16 + Prisma |
| Auth | JWT (access + refresh), bcrypt password hash |
| Validation | Zod (shared schemas in `packages/contracts`, wired to Nest via a `ZodValidationPipe`) |
| CI | GitHub Actions |
| Integrations | n8n outbound webhook, config via `N8N_WEBHOOK_URL` env only |
| Local dev | No Docker required — local Postgres or a hosted dev DB via `DATABASE_URL` |

Workspace layout:

```
OpsHub/
  pnpm-workspace.yaml
  apps/
    web/          # Next.js
    api/          # NestJS + prisma/
  packages/
    contracts/    # Zod schemas + inferred TS types + enums (shared web <-> api)
```

`packages/contracts` is the only shared package in v1. Do not add more.

---

## 1. MVP boundary

### Ships in v1

- Email + password auth, JWT access (15 min) + refresh (30 d) tokens.
- One workspace auto-created at registration; owner membership.
- Workspace/User/Membership/Role entities present and enforced end-to-end
  (every query scoped by `workspaceId`), even though only one real user exists.
- Projects: full CRUD, all fields from the spec, health computed automatically.
- New-project wizard with 5 templates seeding starter tasks.
- Tasks: full CRUD, kanban board (status), dependencies (single-level gating),
  links, notes, recurrence (interval-based), tags.
- Milestones: CRUD, progress derived from linked tasks.
- Notes and TaskLinks.
- Time tracking: manual entries + start/stop timer, one active timer per user,
  overlap prevention, billable flag, reports by project/day/week.
- Budgets: one `ProjectBudget` per project, burn calculation, thresholds at
  50/75/90/100 with once-only `BudgetAlert`.
- Automations: catalog of workspace automations, manual "simulate run",
  automatic emission on the 4 defined triggers, `AutomationRun` history.
- ActivityEvent feed per project and per workspace.
- Views: Today, Projects, Project Detail (all tabs), Time, Financial Overview,
  Automations, Weekly Review.
- Weekly Review: generated snapshot (read model persisted as an ActivityEvent +
  returned payload), triggers a webhook.
- Seed script with demo workspace, demo user, 4 demo projects.
- CI: install, typecheck, lint, build, `prisma validate`, api unit + e2e tests.

### Explicitly deferred (do NOT build in v1)

- Invitations / multi-user login / collaborator UI. The model supports it; the
  UI and invite flow are v2.
- Inbound n8n webhooks (n8n → OpsHub). v1 is outbound-only.
- OAuth / SSO / 2FA / password reset email (v1: password change while logged in).
- File attachments / uploads.
- Multiple budgets per project, invoicing, expense tracking, tax, multi-currency
  conversion (currency is stored per budget but never converted).
- Full RRULE support (see recurrence decision below).
- Real-time (WebSocket) updates; polling / router refresh is fine.
- Mobile app, offline mode, PWA.
- Cross-project task dependencies (v1: dependencies are same-project only).
- Sub-tasks / task hierarchy.
- Custom fields, custom statuses, custom roles.
- Search across everything (v1: per-list filtering only).
- Audit log export, GDPR tooling, soft-delete restore UI (soft-delete columns
  exist; the UI only hard-archives).
- Background job queue (BullMQ/Redis). v1 uses a single in-process
  `@nestjs/schedule` cron — see §2.10.

---

## 2. Data model (Prisma)

`apps/api/prisma/schema.prisma`. Conventions:

- IDs: `String @id @default(cuid())`.
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- All money: `Decimal @db.Decimal(12, 2)`. All rates: `Decimal @db.Decimal(10, 2)`.
- All durations: integer **minutes**.
- Every tenant-owned row carries `workspaceId` denormalized (even when reachable
  through a parent) so the guard can filter with one predicate and so composite
  indexes `(workspaceId, ...)` work on every hot query.
- Soft delete: `archivedAt DateTime?` on Project, Task, Automation only.

### 2.1 Enums

```prisma
enum RoleName        { OWNER ADMIN MEMBER }
enum ProjectType     { PRODUCT CLIENT_PRODUCT AUTOMATION_SYSTEM INTERNAL_TOOL OTHER }
enum ProjectStatus   { ACTIVE MAINTENANCE PAUSED ARCHIVED }
enum ProjectHealth   { HEALTHY NEEDS_ATTENTION BLOCKED }
enum Priority        { CRITICAL HIGH MEDIUM LOW }
enum TaskCategory    { FEATURE BUG MAINTENANCE CLIENT_REQUEST AUTOMATION DEPLOYMENT DOCUMENTATION TECH_DEBT }
enum TaskStatus      { BACKLOG NEXT IN_PROGRESS WAITING REVIEW DONE }
enum MilestoneStatus { PLANNED IN_PROGRESS DONE CANCELLED }
enum BillingModel    { FIXED_PRICE HOURLY INTERNAL }
enum RecurrenceUnit  { DAY WEEK MONTH }
enum RecurrenceAnchor{ DUE_DATE COMPLETION_DATE }
enum AutomationTrigger { TASK_OVERDUE_HIGH_PRIORITY PROJECT_HEALTH_CHANGED BUDGET_THRESHOLD_REACHED WEEKLY_REVIEW_GENERATED MANUAL }
enum AutomationRunStatus { SUCCESS FAILED SIMULATED SKIPPED }
enum ActivityType    { PROJECT_CREATED PROJECT_STATUS_CHANGED PROJECT_HEALTH_CHANGED
                       TASK_CREATED TASK_STATUS_CHANGED TASK_PRIORITY_CHANGED
                       TASK_BLOCKED TASK_UNBLOCKED TASK_COMPLETED TASK_RECURRED
                       MILESTONE_COMPLETED
                       TIME_ENTRY_LOGGED
                       BUDGET_CREATED BUDGET_THRESHOLD_REACHED
                       AUTOMATION_RUN WEEKLY_REVIEW_GENERATED }
```

### 2.2 Tenancy & identity

```prisma
model Workspace {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  timezone    String   @default("America/Argentina/Buenos_Aires")
  weekStartsOn Int     @default(1)   // ISO: 1 = Monday
  defaultCurrency String @default("USD")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  memberships Membership[]
  projects    Project[]
  templates   ProjectTemplate[]
  automations Automation[]
  activity    ActivityEvent[]
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  timezone     String   @default("America/Argentina/Buenos_Aires")
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships  Membership[]
  timeEntries  TimeEntry[]
  notes        Note[]
  activity     ActivityEvent[]
  refreshTokens RefreshToken[]
}

model Role {
  id          String   @id @default(cuid())
  name        RoleName @unique
  // Permission strings, e.g. "project:write", "budget:read", "workspace:manage".
  permissions String[]
  memberships Membership[]
}

model Membership {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  roleId      String
  invitedAt   DateTime @default(now())
  acceptedAt  DateTime?

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        Role      @relation(fields: [roleId], references: [id])

  @@unique([workspaceId, userId])
  @@index([userId])
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique      // sha256 of the opaque refresh token
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, expiresAt])
}
```

`Role` is a seeded lookup table with exactly 3 rows. Permissions live in the
row, so adding a permission is a seed/migration change, not a schema change.

### 2.3 Projects

```prisma
model Project {
  id              String        @id @default(cuid())
  workspaceId     String
  name            String
  description     String?
  type            ProjectType
  status          ProjectStatus @default(ACTIVE)
  health          ProjectHealth @default(HEALTHY)
  healthReason    String?                 // human-readable, set by the health evaluator
  healthEvaluatedAt DateTime?
  priority        Priority      @default(MEDIUM)
  technologyTags  String[]      @default([])
  repositoryUrl   String?
  deploymentUrl   String?
  documentationUrl String?
  stakeholderLabel String?                // client / stakeholder name, free text
  color           String?                 // hex, UI accent
  templateId      String?                 // template used at creation, informational
  lastActivityAt  DateTime      @default(now())
  archivedAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  template    ProjectTemplate? @relation(fields: [templateId], references: [id])
  tasks       Task[]
  milestones  Milestone[]
  notes       Note[]
  timeEntries TimeEntry[]
  budget      ProjectBudget?
  activity    ActivityEvent[]
  automations Automation[]

  @@unique([workspaceId, name])
  @@index([workspaceId, status, health])
  @@index([workspaceId, lastActivityAt])
}

model ProjectTemplate {
  id          String   @id @default(cuid())
  workspaceId String?              // null = built-in/global template
  key         String               // "product_development" | "client_product" |
                                   // "automation_system" | "internal_tool" | "empty"
  name        String
  description String?
  projectType ProjectType
  // Ordered starter tasks:
  // [{ title, category, priority, status, offsetDays?, estimatedHours? }]
  starterTasks Json    @default("[]")
  isBuiltIn   Boolean  @default(true)
  createdAt   DateTime @default(now())

  workspace   Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  projects    Project[]

  @@unique([workspaceId, key])
}

model Milestone {
  id          String          @id @default(cuid())
  workspaceId String
  projectId   String
  title       String
  description String?
  targetDate  DateTime?
  completedAt DateTime?
  status      MilestoneStatus @default(PLANNED)
  sortOrder   Int             @default(0)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks   Task[]

  @@index([workspaceId, projectId, sortOrder])
}
```

### 2.4 Tasks

```prisma
model Task {
  id              String       @id @default(cuid())
  workspaceId     String
  projectId       String
  milestoneId     String?
  title           String
  description     String?
  category        TaskCategory @default(FEATURE)
  priority        Priority     @default(MEDIUM)
  status          TaskStatus   @default(BACKLOG)
  dueDate         DateTime?
  estimatedHours  Decimal?     @db.Decimal(6, 2)
  tags            String[]     @default([])
  sortOrder       Int          @default(0)   // position inside its kanban column
  surfacedForDate DateTime?    @db.Date      // manual "show in Today" pin
  isBlocked       Boolean      @default(false) // denormalized, see §2.8
  completedAt     DateTime?
  archivedAt      DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  // recurrence (see §2.9)
  recurrenceUnit     RecurrenceUnit?
  recurrenceInterval Int?
  recurrenceAnchor   RecurrenceAnchor? @default(DUE_DATE)
  recurrenceEndsAt   DateTime?
  recurrenceSeriesId String?          // stable id shared by all occurrences
  occurrenceIndex    Int?             // 0 for the first, +1 per generated occurrence

  project      Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  milestone    Milestone? @relation(fields: [milestoneId], references: [id], onDelete: SetNull)
  dependencies TaskDependency[] @relation("dependent")   // rows where this task is blocked
  dependents   TaskDependency[] @relation("prerequisite")
  links        TaskLink[]
  notes        Note[]
  timeEntries  TimeEntry[]

  @@index([workspaceId, projectId, status, sortOrder])
  @@index([workspaceId, status, dueDate])          // Today view
  @@index([workspaceId, priority, dueDate])        // overdue-high scan
  @@unique([recurrenceSeriesId, occurrenceIndex])  // recurrence idempotency
}

model TaskDependency {
  id              String   @id @default(cuid())
  workspaceId     String
  taskId          String   // the blocked task
  dependsOnTaskId String   // the prerequisite
  createdAt       DateTime @default(now())

  task      Task @relation("dependent",    fields: [taskId],          references: [id], onDelete: Cascade)
  dependsOn Task @relation("prerequisite", fields: [dependsOnTaskId], references: [id], onDelete: Cascade)

  @@unique([taskId, dependsOnTaskId])
  @@index([dependsOnTaskId])
}

model TaskLink {
  id        String   @id @default(cuid())
  workspaceId String
  taskId    String
  label     String
  url       String
  createdAt DateTime @default(now())
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  @@index([taskId])
}

model Note {
  id          String   @id @default(cuid())
  workspaceId String
  projectId   String
  taskId      String?
  authorId    String
  title       String?
  body        String              // markdown
  pinned      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task    Task?   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author  User    @relation(fields: [authorId], references: [id])

  @@index([workspaceId, projectId, pinned, createdAt])
}
```

### 2.5 Time tracking

```prisma
model TimeEntry {
  id              String   @id @default(cuid())
  workspaceId     String
  projectId       String
  taskId          String?
  userId          String
  startTime       DateTime
  endTime         DateTime?           // null == running timer
  durationMinutes Int?                // null while running; computed on stop
  billable        Boolean  @default(false)
  description     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task    Task?   @relation(fields: [taskId], references: [id], onDelete: SetNull)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([workspaceId, userId, startTime])
  @@index([workspaceId, projectId, startTime])
}
```

### 2.6 Budgets

```prisma
model ProjectBudget {
  id             String       @id @default(cuid())
  workspaceId    String
  projectId      String       @unique      // one budget per project in v1
  currency       String       @default("USD")   // ISO 4217, never converted
  billingModel   BillingModel
  budgetAmount   Decimal?     @db.Decimal(12, 2)  // required unless INTERNAL
  hourlyRate     Decimal?     @db.Decimal(10, 2)  // required when HOURLY
  estimatedHours Decimal?     @db.Decimal(8, 2)
  startDate      DateTime?
  endDate        DateTime?
  alertThresholds Int[]       @default([50, 75, 90, 100])
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  project Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  alerts  BudgetAlert[]
}

model BudgetAlert {
  id               String   @id @default(cuid())
  workspaceId      String
  projectBudgetId  String
  threshold        Int              // 50 | 75 | 90 | 100
  burnPercentAtFire Decimal @db.Decimal(6, 2)
  amountAtFire     Decimal  @db.Decimal(12, 2)
  triggeredAt      DateTime @default(now())
  acknowledgedAt   DateTime?

  budget ProjectBudget @relation(fields: [projectBudgetId], references: [id], onDelete: Cascade)

  @@unique([projectBudgetId, threshold])   // <- the whole dedupe mechanism
  @@index([workspaceId, triggeredAt])
}
```

### 2.7 Automations & activity

```prisma
model Automation {
  id          String            @id @default(cuid())
  workspaceId String
  projectId   String?                       // null = workspace-level
  name        String
  description String?
  trigger     AutomationTrigger
  enabled     Boolean           @default(true)
  // Trigger-specific config, e.g. { "thresholds": [90,100] } or { "priorities": ["CRITICAL","HIGH"] }
  config      Json              @default("{}")
  lastRunAt   DateTime?
  archivedAt  DateTime?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project   Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  runs      AutomationRun[]

  @@index([workspaceId, trigger, enabled])
}

model AutomationRun {
  id            String              @id @default(cuid())
  workspaceId   String
  automationId  String
  projectId     String?
  trigger       AutomationTrigger
  status        AutomationRunStatus
  simulated     Boolean             @default(false)
  requestPayload Json                              // exactly what we sent / would have sent
  responseStatus Int?
  responseBody  String?                            // truncated to 2000 chars
  errorMessage  String?
  durationMs    Int?
  startedAt     DateTime            @default(now())
  finishedAt    DateTime?
  // dedupe key for auto-triggered runs, e.g. "TASK_OVERDUE:<taskId>:2026-07-25"
  dedupeKey     String?

  automation Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)

  @@unique([automationId, dedupeKey])
  @@index([workspaceId, startedAt])
  @@index([automationId, startedAt])
}

model ActivityEvent {
  id          String       @id @default(cuid())
  workspaceId String
  projectId   String?
  actorId     String?              // null = system/cron
  type        ActivityType
  entityType  String               // "Task" | "Project" | "TimeEntry" | ...
  entityId    String?
  summary     String               // pre-rendered one-liner for the feed
  metadata    Json         @default("{}")   // { from, to, ... }
  createdAt   DateTime     @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project   Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  actor     User?     @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([workspaceId, createdAt])
  @@index([projectId, createdAt])
}
```

---

### 2.8 Business-rule mechanisms (the hard parts)

#### (a) Only one active timer per user

Prisma cannot express a partial unique index, so it goes in a hand-written
migration alongside the generated SQL:

```sql
CREATE UNIQUE INDEX time_entry_one_active_per_user
  ON "TimeEntry" ("userId")
  WHERE "endTime" IS NULL;
```

**Application flow** (`TimeEntriesService.startTimer`): inside a transaction,
`findFirst({ userId, endTime: null })`. If one exists, behavior is governed by a
request flag `onConflict: 'reject' | 'stopPrevious'` (default `reject` → HTTP
409 with the running entry in the body; the UI offers "stop and start new"
which resends with `stopPrevious`). The DB index is the backstop against a
double-click race — a `P2002` on that index is mapped to the same 409.

#### (b) No negative and no overlapping durations

Three layers, all required:

1. **Check constraints** (hand-written migration):

```sql
ALTER TABLE "TimeEntry"
  ADD CONSTRAINT time_entry_end_after_start
    CHECK ("endTime" IS NULL OR "endTime" > "startTime"),
  ADD CONSTRAINT time_entry_duration_positive
    CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0),
  ADD CONSTRAINT time_entry_duration_matches
    CHECK ("endTime" IS NULL OR "durationMinutes" IS NOT NULL);
```

2. **Exclusion constraint** for overlap — the authoritative mechanism. Closed
   entries for the same user may not overlap; open (running) entries are
   excluded because their range is unbounded and there is at most one anyway:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT time_entry_no_overlap
  EXCLUDE USING gist (
    "userId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  ) WHERE ("endTime" IS NOT NULL);
```

   `'[)'` bounds make back-to-back entries (10:00–11:00 and 11:00–12:00) legal.

3. **Application pre-check** in `TimeEntriesService` so users get a useful 422
   naming the conflicting entry instead of a raw driver error. A `23P01`
   exclusion violation from Postgres is caught and mapped to the same 422.

`durationMinutes` is always server-computed:
`round((endTime - startTime) / 60000)`, minimum 1. Clients never send it.
On timer stop, a stop time before `startTime` is rejected.

#### (c) Task dependency gating

- `TaskDependency` is same-project only (validated in the service; a
  cross-project dependency is a 422). Depth is arbitrary but v1 gating only
  looks one level deep for *blocking*, and cycles are rejected on create with a
  recursive CTE reachability check (`dependsOnTaskId` must not already reach
  `taskId`).
- **Blocked definition**: task T is blocked iff at least one row
  `TaskDependency(taskId = T)` exists whose `dependsOn.status != DONE` and
  `dependsOn.archivedAt IS NULL`.
- `Task.isBlocked` is a **denormalized cache**, never trusted for the write
  guard. It is recomputed for all dependents inside the same transaction
  whenever a prerequisite's status or archival changes, and for T itself when
  its dependency set changes.
- **The guard**: `TasksService.updateStatus(T, DONE)` runs a fresh
  `count(dependencies where status != DONE)` inside the transaction (with
  `SELECT ... FOR UPDATE` on the prerequisite rows). If `> 0` → HTTP 409
  `TASK_BLOCKED_BY_DEPENDENCY` with the blocking task ids. There is deliberately
  **no** DB-level constraint for this — it is a cross-row rule and a trigger
  would be harder to test than the transaction.
- Moving a task to any non-DONE status is always allowed, blocked or not.

#### (d) "Actionable" (the Today view)

A task appears in Today iff **all** of:

1. `archivedAt IS NULL` and `status NOT IN (DONE)`;
2. `isBlocked = false` (recomputed live in the same query via a `NOT EXISTS`
   subquery on unresolved dependencies — the cache is used only for sorting);
3. the parent project's `status IN (ACTIVE, MAINTENANCE)` and
   `archivedAt IS NULL`;
4. and at least one of:
   - `dueDate <= end_of_today` in the workspace timezone (covers due-today and
     overdue), **or**
   - `status = IN_PROGRESS` (already started — always actionable), **or**
   - `surfacedForDate = today` (manual pin), **or**
   - `status = NEXT AND priority IN (CRITICAL, HIGH)` (the "what's next"
     backfill, capped at 5 items so Today never becomes a dump).

Ordering: overdue first, then Critical → Low, then earliest `dueDate`, then
`sortOrder`. `WAITING` tasks are shown in a separate collapsed "Waiting on"
section and are **not** counted as actionable.

#### (e) Project health rule (exact)

Evaluated by `ProjectHealthService.evaluate(projectId)` after every task
status/priority/due-date change, task create/delete, dependency change, and once
per day by cron. Deterministic, first match wins:

```
Let HIGH = priority in (CRITICAL, HIGH), open = status not in (DONE) and not archived.

BLOCKED          if  count(tasks where HIGH and open and isBlocked) >= 1
                 or  count(tasks where HIGH and status = WAITING and
                                       updatedAt < now() - 7 days) >= 1
NEEDS_ATTENTION  if  count(tasks where HIGH and open and dueDate < today) >= 1
                 or  count(tasks where open and dueDate < today) >= 3
                 or  budget burnPercent >= 90
                 or  project.lastActivityAt < now() - 14 days
                     (only when status = ACTIVE)
HEALTHY          otherwise
```

`status = PAUSED | ARCHIVED` short-circuits to `HEALTHY` (a paused project is
not "unhealthy", it is parked) and is excluded from the Today view anyway.
Each branch writes `healthReason` (e.g. `"2 high-priority tasks overdue"`) and
`healthEvaluatedAt`. If the computed value differs from the stored one:
transaction writes the new health, an `ActivityEvent(PROJECT_HEALTH_CHANGED)`
with `{from, to, reason}`, and enqueues the `PROJECT_HEALTH_CHANGED` webhook.

#### (f) Which changes create an ActivityEvent

Exactly these, no more (avoids a noisy feed):

| Event | Trigger |
| --- | --- |
| `PROJECT_CREATED` | project create |
| `PROJECT_STATUS_CHANGED` | `status` field changes |
| `PROJECT_HEALTH_CHANGED` | computed health differs from stored |
| `TASK_CREATED` | task create (including template + recurrence seeding, batched into one event when > 3 at once) |
| `TASK_STATUS_CHANGED` | `status` changes (except → DONE, see below) |
| `TASK_COMPLETED` | status → DONE |
| `TASK_PRIORITY_CHANGED` | priority changes to/from CRITICAL or HIGH only |
| `TASK_BLOCKED` / `TASK_UNBLOCKED` | `isBlocked` flips |
| `MILESTONE_COMPLETED` | milestone status → DONE |
| `TIME_ENTRY_LOGGED` | timer stopped or manual entry created (not on edit) |
| `BUDGET_CREATED` | budget create |
| `BUDGET_THRESHOLD_REACHED` | a `BudgetAlert` row is actually inserted |
| `AUTOMATION_RUN` | an `AutomationRun` finishes with FAILED (successes are visible in run history; only failures reach the feed) |
| `WEEKLY_REVIEW_GENERATED` | weekly review generated |

Field edits (title, description, tags, links, notes) do **not** create events.
Every event write also bumps `Project.lastActivityAt` in the same transaction.

#### (g) Budget burn formulas

Inputs, all scoped to the project and the budget's date window when set
(`startDate <= startTime < endDate + 1 day`):

```
trackedMinutes        = sum(TimeEntry.durationMinutes)                 // closed entries only
billableMinutes       = sum(TimeEntry.durationMinutes where billable)
trackedHours          = trackedMinutes  / 60
billableHours         = billableMinutes / 60
estimatedHours        = ProjectBudget.estimatedHours

// Value consumed, per billing model:
HOURLY:       trackedValue = billableHours * hourlyRate
FIXED_PRICE:  trackedValue = billableHours * (budgetAmount / estimatedHours)   // implicit rate
              // if estimatedHours is null or 0 -> trackedValue = null,
              // burnPercent falls back to the hours-based figure below
INTERNAL:     trackedValue = trackedHours * (hourlyRate ?? 0)   // cost view only, no alerts

// Percentages:
valueBurnPercent = budgetAmount > 0 ? (trackedValue / budgetAmount) * 100 : null
hoursBurnPercent = estimatedHours > 0 ? (trackedHours / estimatedHours) * 100 : null

// The single number used for alerts, health, and the UI ring:
burnPercent = valueBurnPercent ?? hoursBurnPercent ?? 0

remainingAmount = budgetAmount - trackedValue        // may go negative (over budget)
remainingHours  = estimatedHours - trackedHours      // may go negative
```

Rounding: money to 2 decimals (`ROUND_HALF_UP`), percentages to 2 decimals,
computed with `Decimal` — never JS floats. `INTERNAL` budgets are excluded from
Financial Overview revenue totals and never fire alerts.

#### (h) Budget alert dedupe (fires once per threshold, ever)

`BudgetAlert` has `@@unique([projectBudgetId, threshold])`. That unique index
**is** the dedupe. `BudgetsService.evaluateAlerts(budgetId)` runs after every
TimeEntry create/update/delete for the project and after budget edits:

```ts
for (const t of budget.alertThresholds.sort(asc)) {
  if (burnPercent < t) continue;
  const created = await tx.budgetAlert.createMany({
    data: [{ projectBudgetId, threshold: t, burnPercentAtFire, amountAtFire, workspaceId }],
    skipDuplicates: true,           // -> 0 rows if already fired
  });
  if (created.count === 1) { emitActivity(BUDGET_THRESHOLD_REACHED); enqueueWebhook(...); }
}
```

Crossing 50 and 75 in one big entry fires both, in ascending order, once each.
Deleting time so burn drops back below a threshold does **not** clear the alert
— thresholds are historical facts. The user may `acknowledge` an alert (sets
`acknowledgedAt`, hides the banner). Only changing `budgetAmount`,
`hourlyRate`, or `estimatedHours` resets: those edits delete alerts whose
threshold is above the new `burnPercent`, so they can fire again meaningfully.

#### (i) Recurrence model

**Decision: interval-based, not RRULE.** Full RRULE is overkill for a solo
operator's maintenance chores; if a real need for "3rd Tuesday" appears, it is a
v2 additive field. The model is `recurrenceInterval` (int ≥ 1) +
`recurrenceUnit` (DAY/WEEK/MONTH) + `recurrenceAnchor` + optional
`recurrenceEndsAt`.

- **Trigger**: creating the next occurrence happens **only** when a recurring
  task transitions to `DONE`, inside that same transaction. No cron generates
  tasks. This guarantees exactly one open occurrence per series at any time,
  which is what a solo user wants (no pile-up of 12 missed "weekly backup"
  tasks).
- **Next due date**:
  - `anchor = DUE_DATE`: `nextDue = previousDueDate + interval*unit`. If that is
    already in the past (task completed very late), roll forward in whole
    intervals until `nextDue >= today`. Prevents instantly-overdue clones.
  - `anchor = COMPLETION_DATE`: `nextDue = completedAt + interval*unit`.
  - Month arithmetic clamps to end of month (Jan 31 + 1 month = Feb 28/29).
  - All arithmetic in the workspace timezone, then stored UTC.
- **Stop**: no new occurrence if `recurrenceEndsAt` is set and `nextDue >
  recurrenceEndsAt`.
- **What is copied**: title, description, category, priority, project,
  milestone, tags, estimatedHours, links, recurrence config,
  `recurrenceSeriesId`. **Not copied**: dependencies, notes, time entries,
  `surfacedForDate`. New task starts at `status = NEXT`,
  `occurrenceIndex = previous + 1`.
- **Idempotency**: `@@unique([recurrenceSeriesId, occurrenceIndex])`. A retried
  or double-submitted completion hits the unique index and is swallowed
  (`skipDuplicates`), so a series can never fork.
- On creation of the first recurring task, `recurrenceSeriesId = cuid()` and
  `occurrenceIndex = 0`. Editing recurrence config affects future occurrences
  only.

---

### 2.9 n8n webhook contract

Config: `N8N_WEBHOOK_URL` (optional), `N8N_WEBHOOK_SECRET` (optional),
`N8N_WEBHOOK_TIMEOUT_MS` (default 5000). No URL configured is a normal state,
not an error.

Single generic envelope, `POST` with
`Content-Type: application/json` and, when a secret is set,
`X-OpsHub-Signature: sha256=<hmac(secret, rawBody)>`:

```jsonc
{
  "eventType": "task.overdue.high_priority",   // | "project.health.changed"
                                               // | "budget.threshold.reached"
                                               // | "weekly_review.generated"
  "eventId": "clx...",                         // == AutomationRun.id, for consumer idempotency
  "occurredAt": "2026-07-25T14:03:11.442Z",
  "workspace": { "id": "clx...", "name": "Maxi Ops", "slug": "maxi-ops" },
  "project":   { "id": "clx...", "name": "Hernan Shop", "type": "CLIENT_PRODUCT",
                 "status": "ACTIVE", "health": "NEEDS_ATTENTION" },   // null for workspace-level
  "automation": { "id": "clx...", "name": "Overdue escalation", "trigger": "TASK_OVERDUE_HIGH_PRIORITY" },
  "simulated": false,
  "payload": { /* event-specific, see below */ }
}
```

Per-event `payload`:

| eventType | payload |
| --- | --- |
| `task.overdue.high_priority` | `{ taskId, title, priority, category, status, dueDate, daysOverdue, assigneeEmail }` |
| `project.health.changed` | `{ from, to, reason, openHighPriorityCount, overdueCount }` |
| `budget.threshold.reached` | `{ budgetId, threshold, burnPercent, trackedValue, budgetAmount, currency, remainingAmount, billingModel }` |
| `weekly_review.generated` | `{ periodStart, periodEnd, tasksCompleted, hoursTracked, billableHours, projectsAtRisk: [{id,name,health}], upcomingDue: [{taskId,title,dueDate}] }` |

**Every attempt produces exactly one `AutomationRun`:**

| Situation | `status` | `simulated` | Notes |
| --- | --- | --- | --- |
| 2xx response | `SUCCESS` | false | stores `responseStatus`, truncated body |
| non-2xx / timeout / DNS error after retries | `FAILED` | false | `errorMessage`; also emits `ActivityEvent(AUTOMATION_RUN)` |
| `N8N_WEBHOOK_URL` unset | `SIMULATED` | true | full `requestPayload` recorded, nothing sent |
| user clicks "Simulate run" in the UI | `SIMULATED` | true | same, regardless of config |
| automation `enabled = false` or config filters it out | `SKIPPED` | false | payload recorded for debugging |

Retries: 2 retries, 1 s then 4 s backoff, only on network errors and 5xx.
Auto-triggered runs set `dedupeKey` (`"<TRIGGER>:<entityId>:<YYYY-MM-DD>"`) so
the daily overdue scan cannot spam the same task twice in a day; a unique
violation on `(automationId, dedupeKey)` means "already fired today" and is
silently dropped. Manual/simulated runs leave `dedupeKey` null (Postgres unique
indexes ignore nulls, so unlimited manual runs are fine).

### 2.10 Scheduling

One `@nestjs/schedule` cron in the API process, `SCHEDULER_ENABLED=true`
(default true; set false in CI/tests and any second instance):

- `*/15 * * * *` — overdue scan: high-priority open tasks whose `dueDate` just
  passed → `TASK_OVERDUE_HIGH_PRIORITY` webhook (deduped by `dedupeKey`).
- `0 3 * * *` — nightly: recompute `isBlocked` for all tasks, re-evaluate
  project health for all active projects, recompute budget burn + alerts.
- `0 9 * * 1` — weekly review generation (workspace-local Monday 09:00).

No Redis, no worker process. If it later needs to scale, this is the seam.

---

## 3. API surface (`apps/api`)

Base path `/api/v1`. All responses `{ data, meta? }`; errors
`{ error: { code, message, details? } }`. All list endpoints support
`?page=&pageSize=&sort=`. Every non-auth route requires
`Authorization: Bearer <access>` **and** resolves a workspace (see §5).

### auth
```
POST   /auth/register                 { email, password, name, workspaceName } -> user + workspace + tokens
POST   /auth/login                    { email, password } -> { accessToken, refreshToken, user, memberships }
POST   /auth/refresh                  { refreshToken } -> new pair (rotates, revokes old)
POST   /auth/logout                   revokes the presented refresh token
GET    /auth/me                       user + memberships + active workspace + running timer
PATCH  /auth/me                       name, timezone
POST   /auth/change-password          { currentPassword, newPassword } -> revokes all refresh tokens
```

### workspaces
```
GET    /workspaces                    workspaces the caller is a member of
GET    /workspaces/:id                workspace + settings + member list
PATCH  /workspaces/:id                name, timezone, weekStartsOn, defaultCurrency   [ADMIN]
GET    /workspaces/:id/members        [ADMIN]
GET    /workspaces/:id/activity       ?projectId=&type=&since=  (workspace feed)
GET    /workspaces/:id/dashboard      Today payload: actionable tasks, running timer,
                                      projects needing attention, today's hours
```

### projects
```
GET    /projects                      ?status=&health=&type=&priority=&tag=&q=&view=list|grid
POST   /projects                      wizard payload (see below)
GET    /projects/:id                  project + counts + budget summary + health reason
PATCH  /projects/:id                  any editable field (status change re-evaluates health)
DELETE /projects/:id                  soft delete -> archivedAt + status ARCHIVED
POST   /projects/:id/archive | /restore
GET    /projects/:id/overview         tab: counts by status, milestone progress, recent activity,
                                      hours this week, burn %
GET    /projects/:id/activity
GET    /project-templates             built-in + workspace templates with starterTasks preview
```

`POST /projects` body (the wizard, one atomic transaction):
```jsonc
{
  "name": "Maxus Market",
  "type": "PRODUCT",
  "status": "ACTIVE", "priority": "HIGH",
  "technologyTags": ["nextjs","postgres"],
  "description": "...", "stakeholderLabel": null,
  "links": { "repositoryUrl": null, "deploymentUrl": null, "documentationUrl": null },
  "budget": {                                   // optional
    "billingModel": "HOURLY", "currency": "USD",
    "budgetAmount": 8000, "hourlyRate": 60, "estimatedHours": 133,
    "startDate": "2026-08-01", "endDate": null,
    "alertThresholds": [50,75,90,100]
  },
  "templateKey": "product_development"          // or "empty"
}
```
Returns the created project **with** its seeded tasks. Template starter tasks are
created at `status = BACKLOG` (first task `NEXT`), `dueDate = createdAt +
offsetDays` when the template specifies one.

### tasks
```
GET    /tasks                         ?projectId=&status=&priority=&category=&tag=&dueBefore=
                                      &blocked=&q=  (also serves the kanban board)
POST   /tasks
GET    /tasks/:id                     task + dependencies + dependents + links + notes + logged hours
PATCH  /tasks/:id
PATCH  /tasks/:id/status              { status } -> 409 TASK_BLOCKED_BY_DEPENDENCY when gated
PATCH  /tasks/:id/position            { status, sortOrder }  (kanban drag, single write)
DELETE /tasks/:id
POST   /tasks/:id/surface             { date } -> pin into Today
POST   /tasks/:id/dependencies        { dependsOnTaskId }  -> 422 on cycle / cross-project
DELETE /tasks/:id/dependencies/:depId
POST   /tasks/:id/links      DELETE /tasks/:id/links/:linkId
GET    /tasks/today                   the actionable set (§2.8d), grouped
```

### milestones / notes
```
GET|POST      /projects/:id/milestones
PATCH|DELETE  /milestones/:id
GET|POST      /projects/:id/notes        ?taskId=
PATCH|DELETE  /notes/:id
```

### time-entries
```
GET    /time-entries                  ?projectId=&taskId=&from=&to=&billable=
POST   /time-entries                  manual entry (start+end required)
PATCH  /time-entries/:id              -> 422 TIME_ENTRY_OVERLAP on conflict
DELETE /time-entries/:id
GET    /time-entries/active           running timer or null
POST   /time-entries/start            { projectId, taskId?, description?, billable?,
                                        onConflict?: "reject"|"stopPrevious" } -> 409 on conflict
POST   /time-entries/stop             { id?, endTime? } stops the running timer
GET    /time-entries/reports          ?groupBy=project|day|week|task&from=&to=
                                      -> { rows:[{key,label,minutes,billableMinutes,value}], totals }
```

### budgets / financial
```
GET    /projects/:id/budget           budget + computed burn block (§2.9g)
PUT    /projects/:id/budget           create or replace (resets stale alerts, see §2.8h)
DELETE /projects/:id/budget
GET    /projects/:id/budget/alerts
POST   /budget-alerts/:id/acknowledge
GET    /financial/overview            ?from=&to= -> per project: budgetAmount, trackedValue,
                                      burnPercent, billableHours, remaining, health;
                                      plus totals by currency and billing model
```

### automations
```
GET    /automations                   ?projectId=&trigger=&enabled=
POST   /automations
PATCH  /automations/:id               enable/disable, config
DELETE /automations/:id
POST   /automations/:id/simulate      builds a real payload from current data, records a
                                      SIMULATED AutomationRun, returns the payload -> 200
GET    /automation-runs               ?automationId=&status=&projectId=&from=&to=
GET    /automation-runs/:id           full request/response payloads
POST   /automation-runs/:id/retry     re-sends the stored payload as a new run   [ADMIN]
GET    /automations/webhook-status    { configured: boolean, url: masked, lastRunAt, lastStatus }
```

### weekly-review
```
GET    /weekly-review                 ?weekStart=  (defaults to current week, read-only, cached 60s)
POST   /weekly-review/generate        { weekStart? } -> persists ActivityEvent, fires webhook,
                                      returns the snapshot
```
Snapshot payload: completed tasks by project, hours tracked vs billable, budget
burn deltas, projects whose health degraded, overdue carry-over, next week's due
tasks, automation failures.

### system
```
GET /health   -> { status, db: "up"|"down", version }   (public, used by CI + uptime checks)
```

---

## 4. Module boundaries

### `apps/api` — NestJS modules

```
src/
  main.ts
  app.module.ts
  common/
    guards/          jwt-auth.guard.ts, workspace.guard.ts, roles.guard.ts
    decorators/      @CurrentUser, @WorkspaceId, @Roles, @Public
    pipes/           zod-validation.pipe.ts
    filters/         prisma-exception.filter.ts (P2002/23P01/23514 -> typed HTTP errors)
    interceptors/    transform.interceptor.ts, logging.interceptor.ts
  prisma/            prisma.module.ts, prisma.service.ts (+ tenant helper)
  config/            env.schema.ts (Zod-validated process.env), config.module.ts
  modules/
    auth/            controller, service, jwt.strategy, refresh-token.service
    users/
    workspaces/      workspaces + memberships + roles + dashboard(Today)
    projects/        projects, project-templates, project-health.service
    tasks/           tasks, task-dependencies, task-links, task-recurrence.service
    milestones/
    notes/
    time-entries/    time-entries + timer.service + reports.service
    budgets/         budgets + budget-calculator.service + budget-alerts.service
    automations/     automations, automation-runs, webhook-dispatcher.service
    activity/        activity.service (write API used by every other module)
    weekly-review/
    scheduler/       cron jobs (§2.10), imports the services above
```

Rules: `activity` and `automations(dispatcher)` are leaf services others import;
they never import back. `project-health.service` is owned by `projects` and
called by `tasks` through an injected interface. Cross-module DB writes always
go through the owning service, never a foreign Prisma call, so transactions and
activity events stay consistent.

### `apps/web` — Next.js App Router

```
app/
  (auth)/login/page.tsx
  (auth)/register/page.tsx
  (app)/layout.tsx                        # shell: sidebar, workspace switcher, timer widget
  (app)/today/page.tsx                    # default landing route
  (app)/projects/page.tsx                 # list/grid toggle + filters
  (app)/projects/new/page.tsx             # wizard (5 steps, client state, one POST)
  (app)/projects/[id]/layout.tsx          # project header + tab nav
  (app)/projects/[id]/page.tsx            # overview
  (app)/projects/[id]/tasks/page.tsx
  (app)/projects/[id]/board/page.tsx      # kanban
  (app)/projects/[id]/milestones/page.tsx
  (app)/projects/[id]/notes/page.tsx      # notes + links
  (app)/projects/[id]/automations/page.tsx
  (app)/projects/[id]/time/page.tsx
  (app)/projects/[id]/budget/page.tsx
  (app)/projects/[id]/activity/page.tsx
  (app)/projects/[id]/settings/page.tsx
  (app)/time/page.tsx                     # all entries + reports
  (app)/financial/page.tsx
  (app)/automations/page.tsx              # catalog + run history
  (app)/weekly-review/page.tsx
  (app)/settings/page.tsx                 # profile, workspace, webhook status
components/  ui/ (primitives), tasks/, projects/, time/, budget/, charts/
lib/         api-client.ts (fetch wrapper + refresh-on-401), auth.ts,
             query-keys.ts, formatters.ts (money/duration/date, tz-aware)
```

Data layer: TanStack Query against the Nest API from client components; Server
Components only for the initial shell and static pages. Tokens: access token in
memory + refresh token in an httpOnly cookie set by a thin Next route handler
(`app/api/session/route.ts`) so the browser never stores a long-lived token in
`localStorage`. Styling: Tailwind + a small local primitive set — no component
library dependency in v1.

---

## 5. Auth design

**Tokens.** Access JWT, 15 min, HS256, secret `JWT_ACCESS_SECRET`. Claims:
```jsonc
{ "sub": userId, "email": "...", "wsIds": ["ws_1"], "jti": "...", "iat":…, "exp":… }
```
No role in the token — roles are read from `Membership` per request so a role
change takes effect immediately. `wsIds` is a fast-fail hint only; membership is
still verified against the DB.

Refresh token: 64 random bytes, opaque, stored **hashed** (sha256) in
`RefreshToken`, 30 d, **rotated on every use** (old row revoked). Reuse of an
already-revoked token revokes the whole family for that user and forces re-login.

**Guard chain** (global, in this order):

1. `JwtAuthGuard` — validates the access token, loads the user, attaches
   `req.user`. Bypassed by `@Public()` (login, register, refresh, health).
2. `WorkspaceGuard` — resolves the target workspace from, in order:
   the `X-Workspace-Id` header, a `:workspaceId` route param, or the user's
   single membership (v1 always has exactly one). Loads
   `Membership + Role`, and attaches `req.workspaceId`, `req.role`,
   `req.permissions`. No membership → 403.
3. `RolesGuard` — reads `@Roles(RoleName.ADMIN)` / `@RequirePermission('budget:write')`
   metadata and checks against `req.permissions`. Absent decorator = any member.

**Workspace scoping — defense in depth, two layers:**

- Every service method takes `workspaceId` as its first argument and every
  Prisma `where` includes it. This is enforced by an ESLint rule plus code
  review: *no controller ever reads `workspaceId` from the request body.* It
  comes from the guard only.
- A Prisma client extension (`prisma.forWorkspace(workspaceId)`) wraps the
  tenant-owned models and injects `where.workspaceId` on
  `findMany/findFirst/update/delete/count` and `data.workspaceId` on `create`.
  Services use the extended client; the raw client is only reachable in
  `auth`, `users`, and the seed script.
- Every "get by id" is a `findFirst({ id, workspaceId })`, never
  `findUnique({ id })`, so a leaked id from another tenant returns 404, not 403
  (no existence disclosure).

**Role permissions (seeded):**

| Role | Permissions |
| --- | --- |
| `OWNER` | `*` — everything, including workspace delete and member management |
| `ADMIN` | everything except workspace delete and owner transfer; can manage budgets, automations, members |
| `MEMBER` | read everything in the workspace; write tasks, notes, links, own time entries; **cannot** write budgets, automations, project settings, or other users' time entries |

Ownership check on top of role: a `MEMBER` may only edit/delete `TimeEntry` rows
where `userId = req.user.id`; `ADMIN`/`OWNER` may edit any.

**Passwords:** bcrypt cost 12, min 10 chars, checked against a small common-password
denylist. Rate limit via `@nestjs/throttler`: 5 attempts / 15 min / IP+email on
`/auth/login`, 20 req/min globally per IP.

---

## 6. Seed data plan

`apps/api/prisma/seed.ts`, idempotent (upsert by natural key), run by
`pnpm --filter api db:seed`. **All data is fabricated and generic. No real
customer names, no real patient or health information, no real financial
figures, no real credentials, no real URLs beyond obvious placeholders
(`https://github.com/demo/...`, `https://demo.example.com`). Project names are
reused from the owner's context as labels only; every task, amount, rate and
note attached to them is invented for demo purposes.**

Seeded, in order:

1. **Roles** — `OWNER`, `ADMIN`, `MEMBER` with the permission sets above.
2. **ProjectTemplates** (built-in, `workspaceId = null`), 5 of them:
   - `product_development` — Define MVP scope, Set up repository and CI, Design
     data model, Build core feature slice, Set up staging deploy, Write README.
   - `client_product` — Kickoff and requirements capture, Agree scope and
     budget, Set up environments, Build first deliverable, Client review round,
     Handover documentation.
   - `automation_system` — **exactly, in this order**:
     1. Document workflow purpose
     2. Validate credentials and secrets
     3. Test happy path
     4. Test failure path
     5. Add monitoring
     6. Add maintenance checklist
   - `internal_tool` — Define the internal problem, Sketch minimal UI, Build
     core script, Add usage docs.
   - `empty` — no starter tasks.
3. **Workspace** `Demo Ops` (slug `demo-ops`, tz `America/Argentina/Buenos_Aires`,
   `defaultCurrency: "USD"`).
4. **User** `demo@opshub.local`, name `Demo Owner`, password from
   `SEED_PASSWORD` env (default `DemoPassword123!`, printed with a loud warning
   that it is dev-only), `OWNER` membership.
5. **Projects** (4), each with tasks spread across statuses so every view has
   content:

| Project | type | status | health target | budget |
| --- | --- | --- | --- | --- |
| Hernan Shop | `CLIENT_PRODUCT` | ACTIVE | NEEDS_ATTENTION (1 overdue High task) | HOURLY, USD, budget 6 000, rate 55, est 110 h |
| Maxus Dental | `CLIENT_PRODUCT` | ACTIVE | BLOCKED (High task blocked by an open dependency) | FIXED_PRICE, USD, budget 4 500, est 90 h |
| Maxus Market | `PRODUCT` | ACTIVE | HEALTHY | INTERNAL, USD, est 200 h, rate 0 |
| Consultorio PYM Automations | `AUTOMATION_SYSTEM` | MAINTENANCE | HEALTHY | HOURLY, USD, budget 2 400, rate 60, est 40 h |

   - Each gets 8–14 tasks across all statuses and categories, generic titles
     ("Fix cart total rounding", "Add appointment reminder job", "Document
     workflow purpose", "Refresh dependency versions"), 2–3 tags each.
   - Maxus Dental seeds one `TaskDependency` where the prerequisite is
     `IN_PROGRESS`, so the dependency-gating 409 and the BLOCKED health rule are
     demonstrable immediately.
   - Consultorio PYM Automations is seeded from the `automation_system` template
     so its 6 starter tasks are exactly the required list; the seed asserts this.
   - One recurring task per workspace: "Weekly dependency and backup check",
     `interval 1 WEEK`, anchor `DUE_DATE`.
   - 2 milestones each on Hernan Shop and Maxus Market.
   - 3–5 notes and a few links total.
6. **TimeEntries** — ~45 closed entries over the last 6 weeks, deterministic
   (seeded PRNG so runs are reproducible), 25–180 min each, never overlapping
   (generated sequentially per day with gaps), mixed billable flags. Volumes are
   chosen so: Hernan Shop lands ~62 % burn (fires the 50 alert), Maxus Dental
   ~78 % (fires 50 and 75), Consultorio ~30 %, Maxus Market internal-only.
   **No running timer is seeded** so the timer flow starts clean.
7. **Automations** — 4 rows: "Escalate overdue high-priority"
   (`TASK_OVERDUE_HIGH_PRIORITY`), "Notify on health change"
   (`PROJECT_HEALTH_CHANGED`), "Budget threshold alert"
   (`BUDGET_THRESHOLD_REACHED`), "Weekly review digest"
   (`WEEKLY_REVIEW_GENERATED`). Plus ~12 historical `AutomationRun` rows mixing
   `SUCCESS`, `SIMULATED`, and one `FAILED` (so the failure UI has content).
8. **BudgetAlerts** and **ActivityEvents** are **not** hand-seeded — they are
   produced by running the real evaluators at the end of the seed, which also
   serves as an end-to-end smoke test of those code paths.

A `pnpm --filter api db:reset` script drops, migrates, and reseeds.

---

## 7. Risks and resolved decisions

Each item below is **decided**. Later agents implement the default; they do not
reopen it.

| # | Question / risk | Decision |
| --- | --- | --- |
| 1 | RRULE vs simple interval recurrence | Interval + unit + anchor. No RRULE in v1. Additive later. |
| 2 | Where to enforce time-entry overlap | Postgres `EXCLUDE USING gist` is authoritative; app pre-check exists only for good error messages. Requires `btree_gist` — the migration creates it, so the dev DB user needs `CREATE EXTENSION` rights (documented in README). |
| 3 | Timer uniqueness: app check vs DB | Partial unique index `WHERE endTime IS NULL` + transactional app check. Both. |
| 4 | Recurrence generated by cron vs on completion | On completion only. Exactly one open occurrence per series; no backlog pile-up. |
| 5 | `isBlocked` denormalized vs computed every read | Denormalized cache for list/sort performance, recomputed in-transaction; the **write guard always re-queries**. Nightly job repairs drift. |
| 6 | Project health computed on read vs stored | Stored, recomputed on relevant writes + nightly. Needed for filtering, indexes, and for firing a change event. |
| 7 | Money type | Prisma `Decimal(12,2)`, `decimal.js` in services. Never JS `number` for money. |
| 8 | Multi-currency | Stored per budget, **never converted**. Financial Overview groups totals by currency. Conversion is v2. |
| 9 | Fixed-price burn when `estimatedHours` is null | `valueBurnPercent` is null; UI shows hours-based burn and a "set estimated hours for value tracking" hint. No crash, no divide-by-zero. |
| 10 | Do budget alerts reset when time is deleted | No. Thresholds are historical. Only editing budgetAmount/rate/estimatedHours prunes alerts above the new burn. |
| 11 | Timezone handling | All timestamps stored UTC (`timestamptz`). "Today", "overdue", and week boundaries are computed in `Workspace.timezone`. Task `dueDate` is a timestamp but treated as end-of-day-in-workspace-tz for overdue checks. |
| 12 | Cross-project dependencies | Rejected in v1 (422). Same-project only. |
| 13 | Sub-tasks | Not in v1. Use dependencies + milestones. |
| 14 | Webhook delivery guarantees | At-most-once with 2 retries, no durable queue. A missed webhook is acceptable; `AutomationRun` always records the attempt and supports manual retry. |
| 15 | Webhook secret / signature | Optional HMAC-SHA256 over the raw body in `X-OpsHub-Signature`. Absent secret = unsigned, still sent. |
| 16 | Background jobs infra | `@nestjs/schedule` in-process, guarded by `SCHEDULER_ENABLED`. No Redis/BullMQ in v1. |
| 17 | Refresh token storage on web | httpOnly cookie via a Next route handler; access token in memory only. |
| 18 | Role in JWT | No. Read per request from `Membership` so revocation is instant. |
| 19 | Hard vs soft delete | Soft delete (`archivedAt`) for Project/Task/Automation; hard delete for TimeEntry, Note, TaskLink, TaskDependency, Milestone. No restore UI in v1. |
| 20 | Tenant isolation approach | Denormalized `workspaceId` on every tenant row + Prisma client extension injecting the filter. No Postgres RLS in v1 (single app-side DB user; RLS is the v2 hardening step). |
| 21 | Shared code between web and api | Only `packages/contracts` (Zod schemas + enums + inferred types). No shared UI or util package. |
| 22 | API versioning | `/api/v1` prefix from day one; no negotiation logic. |
| 23 | Testing scope for v1 CI | Unit tests required for: budget calculator, health evaluator, recurrence date math, actionable-task predicate, overlap detection. E2E (supertest + a test DB) for: auth flow, workspace isolation (user A cannot read workspace B), timer conflict, dependency gating. Web tests deferred to v2 beyond typecheck + build. |
| 24 | Migration strategy | `prisma migrate dev` locally; CI runs `prisma migrate deploy` against a throwaway Postgres service container. The three hand-written SQL blocks (§2.8a, §2.8b) live inside normal migration files so they are never lost on regeneration. |
| 25 | Seeding real data | Never. Seed is fully fabricated; the seed script refuses to run when `NODE_ENV=production` unless `ALLOW_PROD_SEED=true`. |

### Environment variables

```
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=            # required, >= 32 chars
JWT_REFRESH_SECRET=           # required, >= 32 chars
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
N8N_WEBHOOK_URL=              # optional -> absence yields SIMULATED runs
N8N_WEBHOOK_SECRET=           # optional
N8N_WEBHOOK_TIMEOUT_MS=5000
SCHEDULER_ENABLED=true
WEB_ORIGIN=http://localhost:3000
API_PORT=4000
SEED_PASSWORD=                # dev only
```
Validated at boot with a Zod schema in `config/env.schema.ts`; the API refuses
to start on a missing or weak secret.

### CI (`.github/workflows/ci.yml`)

Single workflow on push/PR: pnpm install (frozen lockfile, cached) → `prisma
validate` + `prisma generate` → typecheck (both apps) → lint → api unit tests →
api e2e against a `postgres:16` service container with
`migrate deploy` + seed → `next build`. Fails on any step.

---

## Implementation order (for the next agent)

1. Workspace scaffolding, `packages/contracts`, env validation, CI skeleton.
2. Prisma schema + the 3 hand-written constraint migrations + Role/Template seed.
3. Auth module + guards + workspace scoping extension + isolation e2e test.
4. Projects + templates + wizard endpoint + health evaluator.
5. Tasks + dependencies + gating + recurrence + Today endpoint.
6. Time entries + timer + reports.
7. Budgets + calculator + alerts.
8. Automations + webhook dispatcher + run history.
9. Activity feed + weekly review + scheduler.
10. Full seed script.
11. Web app, in route order: shell → Today → Projects → Project Detail tabs →
    Time → Financial → Automations → Weekly Review.
