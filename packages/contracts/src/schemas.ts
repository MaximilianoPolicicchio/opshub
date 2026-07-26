import { z } from "zod";
import {
  ProjectType,
  ProjectStatus,
  Priority,
  TaskCategory,
  TaskStatus,
  BillingModel,
  RecurrenceUnit,
  RecurrenceAnchor,
  ProjectTemplateKey,
} from "./enums";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  name: z.string().min(1).max(120),
  workspaceName: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const projectLinksSchema = z.object({
  repositoryUrl: z.string().url().nullable().optional(),
  deploymentUrl: z.string().url().nullable().optional(),
  documentationUrl: z.string().url().nullable().optional(),
});

export const budgetInputSchema = z.object({
  billingModel: z.enum(BillingModel),
  currency: z.string().length(3).default("USD"),
  budgetAmount: z.number().nonnegative().nullable().optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  estimatedHours: z.number().nonnegative().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  alertThresholds: z.array(z.number().int().min(1).max(100)).default([50, 75, 90, 100]),
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;

export const createProjectSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(4000).nullable().optional(),
  type: z.enum(ProjectType),
  status: z.enum(ProjectStatus).default("ACTIVE"),
  priority: z.enum(Priority).default("MEDIUM"),
  technologyTags: z.array(z.string().min(1).max(40)).default([]),
  stakeholderLabel: z.string().max(160).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  links: projectLinksSchema.optional(),
  budget: budgetInputSchema.optional(),
  templateKey: z.enum(ProjectTemplateKey).default("empty"),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .omit({ templateKey: true })
  .partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  milestoneId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  category: z.enum(TaskCategory).default("FEATURE"),
  priority: z.enum(Priority).default("MEDIUM"),
  status: z.enum(TaskStatus).default("BACKLOG"),
  dueDate: z.string().datetime().nullable().optional(),
  estimatedHours: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).default([]),
  recurrenceUnit: z.enum(RecurrenceUnit).nullable().optional(),
  recurrenceInterval: z.number().int().min(1).nullable().optional(),
  recurrenceAnchor: z.enum(RecurrenceAnchor).default("DUE_DATE").nullable().optional(),
  recurrenceEndsAt: z.string().datetime().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema
  .omit({ projectId: true })
  .partial();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateTaskStatusSchema = z.object({
  status: z.enum(TaskStatus),
});
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

export const updateTaskPositionSchema = z.object({
  status: z.enum(TaskStatus),
  sortOrder: z.number().int().min(0),
});
export type UpdateTaskPositionInput = z.infer<typeof updateTaskPositionSchema>;

export const createTaskDependencySchema = z.object({
  dependsOnTaskId: z.string().min(1),
});
export type CreateTaskDependencyInput = z.infer<typeof createTaskDependencySchema>;

export const createTaskLinkSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().url(),
});
export type CreateTaskLinkInput = z.infer<typeof createTaskLinkSchema>;

export const startTimerSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  billable: z.boolean().default(false),
  onConflict: z.enum(["reject", "stopPrevious"]).default("reject"),
});
export type StartTimerInput = z.infer<typeof startTimerSchema>;

export const stopTimerSchema = z.object({
  id: z.string().nullable().optional(),
  endTime: z.string().datetime().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});
export type StopTimerInput = z.infer<typeof stopTimerSchema>;

export const createTimeEntrySchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().nullable().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  billable: z.boolean().default(false),
  description: z.string().max(500).nullable().optional(),
});
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;

export const updateTimeEntrySchema = createTimeEntrySchema.omit({ projectId: true }).partial();
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;

export const createNoteSchema = z.object({
  taskId: z.string().nullable().optional(),
  title: z.string().max(160).nullable().optional(),
  body: z.string().min(1).max(20000),
  pinned: z.boolean().default(false),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const createMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const createAutomationSchema = z.object({
  projectId: z.string().nullable().optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  trigger: z.enum([
    "TASK_OVERDUE_HIGH_PRIORITY",
    "PROJECT_HEALTH_CHANGED",
    "BUDGET_THRESHOLD_REACHED",
    "WEEKLY_REVIEW_GENERATED",
    "MANUAL",
  ]),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

export const surfaceTaskSchema = z.object({
  date: z.string().datetime(),
});
export type SurfaceTaskInput = z.infer<typeof surfaceTaskSchema>;
