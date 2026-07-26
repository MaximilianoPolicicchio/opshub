import type {
  ProjectType,
  ProjectStatus,
  ProjectHealth,
  Priority,
  TaskCategory,
  TaskStatus,
  MilestoneStatus,
  BillingModel,
  AutomationTrigger,
  AutomationRunStatus,
  ActivityType,
} from "@opshub/contracts";

export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  lastLoginAt: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  weekStartsOn: number;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  workspaceId: string;
  userId: string;
  roleId: string;
  workspace?: Workspace;
  role?: { id: string; name: string; permissions: string[] };
}

export interface MeResponse {
  user: User;
  memberships: Membership[];
  runningTimer: TimeEntry | null;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  health: ProjectHealth;
  healthReason: string | null;
  healthEvaluatedAt: string | null;
  priority: Priority;
  technologyTags: string[];
  repositoryUrl: string | null;
  deploymentUrl: string | null;
  documentationUrl: string | null;
  stakeholderLabel: string | null;
  color: string | null;
  templateId: string | null;
  lastActivityAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  budget?: ProjectBudget | null;
  taskCount?: number;
  milestoneCount?: number;
  /** Aggregates supplied by the projects list endpoint (see GET /projects). */
  openTaskCount?: number;
  blockedTaskCount?: number;
  minutesThisWeek?: number;
  burnPercent?: number | null;
  nextMilestone?: { id: string; title: string; targetDate: string | null } | null;
}

export interface ProjectListResult {
  rows: Project[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProjectOverview {
  project: Project;
  countsByStatus: { status: TaskStatus; _count: number }[];
  milestoneProgress: number;
  recentActivity: ActivityEvent[];
  hoursThisWeek: number;
}

export interface ProjectTemplate {
  id: string;
  workspaceId: string | null;
  key: string;
  name: string;
  description: string | null;
  projectType: ProjectType;
  starterTasks: { title: string; category: string; priority: string; status?: string; offsetDays?: number; estimatedHours?: number }[];
  isBuiltIn: boolean;
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  estimatedHours: number | string | null;
  tags: string[];
  sortOrder: number;
  surfacedForDate: string | null;
  isBlocked: boolean;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recurrenceUnit: string | null;
  recurrenceInterval: number | null;
  recurrenceAnchor: string | null;
  recurrenceEndsAt: string | null;
  dependencies?: TaskDependency[];
  dependents?: TaskDependency[];
  links?: TaskLink[];
  notes?: Note[];
  loggedHours?: number;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
}

export interface TaskLink {
  id: string;
  taskId: string;
  label: string;
  url: string;
}

export interface Note {
  id: string;
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  authorId: string;
  title: string | null;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  completedAt: string | null;
  status: MilestoneStatus;
  sortOrder: number;
}

export interface TimeEntry {
  id: string;
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  userId: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  billable: boolean;
  description: string | null;
  project?: { id: string; name: string };
  task?: { id: string; title: string } | null;
}

export interface TimeReportRow {
  key: string;
  label: string;
  minutes: number;
  billableMinutes: number;
  value: number;
}

export interface TimeReportResult {
  rows: TimeReportRow[];
  totals: { minutes: number; billableMinutes: number };
}

export interface ProjectBudget {
  id: string;
  workspaceId: string;
  projectId: string;
  currency: string;
  billingModel: BillingModel;
  budgetAmount: number | string | null;
  hourlyRate: number | string | null;
  estimatedHours: number | string | null;
  startDate: string | null;
  endDate: string | null;
  alertThresholds: number[];
}

export interface BudgetBurn {
  trackedHours: number | string;
  billableHours: number | string;
  trackedValue: number | string | null;
  valueBurnPercent: number | string | null;
  hoursBurnPercent: number | string | null;
  burnPercent: number | string;
  remainingAmount: number | string | null;
  remainingHours: number | string | null;
}

export interface BudgetWithBurn {
  budget: ProjectBudget;
  burn: BudgetBurn;
}

export interface BudgetAlert {
  id: string;
  projectBudgetId: string;
  threshold: number;
  burnPercentAtFire: number | string;
  amountAtFire: number | string;
  triggeredAt: string;
  acknowledgedAt: string | null;
}

export interface FinancialOverviewRow {
  projectId: string;
  projectName: string;
  currency: string;
  billingModel: BillingModel;
  budgetAmount: number | string | null;
  trackedValue: number | string | null;
  burnPercent: number;
  billableHours: number;
  remaining: number | string | null;
  health: ProjectHealth;
}

export interface FinancialOverview {
  rows: FinancialOverviewRow[];
  totalsByCurrency: Record<string, { budgetAmount: number; trackedValue: number; billingModel: Record<string, number> }>;
}

export interface Automation {
  id: string;
  workspaceId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  enabled: boolean;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface AutomationRun {
  id: string;
  workspaceId: string;
  automationId: string;
  projectId: string | null;
  trigger: AutomationTrigger;
  status: AutomationRunStatus;
  simulated: boolean;
  requestPayload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
  dedupeKey: string | null;
}

export interface WebhookStatus {
  configured: boolean;
  url: string | null;
}

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  projectId: string | null;
  actorId: string | null;
  type: ActivityType;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TodayResponse {
  actionable: Task[];
  waiting: Task[];
}

export interface DashboardResponse {
  actionableTasks: Task[];
  waitingTasks: Task[];
  runningTimer: TimeEntry | null;
  projectsNeedingAttention: Project[];
  todaysHours: number;
}

export interface WeeklyReview {
  periodStart: string;
  periodEnd: string;
  tasksCompleted: number;
  tasksCompletedByProject: { projectId: string; projectName: string; count: number }[];
  hoursTracked: number;
  billableHours: number;
  projectsAtRisk: { id: string; name: string; health: ProjectHealth }[];
  overdueCarryOver: number;
  upcomingDue: { taskId: string; title: string; dueDate: string | null }[];
  automationFailures: number;
}
