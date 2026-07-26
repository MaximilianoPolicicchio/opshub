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

/**
 * Emails are the login identity, so they are normalised before they ever reach
 * the database: trimmed and lowercased. Without this, `Demo@x.com` and
 * `demo@x.com` register as two separate accounts and one of them can never log
 * in with the password the user thinks they set.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254); // RFC 5321 practical maximum

/**
 * A deliberately small password policy: length does most of the work, and a
 * short denylist blocks the handful of passwords that show up in every
 * credential-stuffing list. No composition rules (upper+digit+symbol) — they
 * push users toward `Password1!` without adding real entropy.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "iloveyou1",
  "admin12345",
  "welcome123",
  "changeme123",
]);

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200, "Password must be at most 200 characters")
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), {
    message: "This password is too common",
  })
  .refine((v) => v.trim().length > 0, { message: "Password cannot be blank" });

/** Human-facing display name: real content, not just whitespace. */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Cannot be empty")
  .max(120)
  // Control characters break log lines and terminal output. Checked by code
  // point rather than a regex literal so the source file stays plain ASCII.
  .refine((v) => ![...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127), {
    message: "Contains control characters",
  });

/**
 * IANA timezone, validated by asking the runtime rather than shipping a list
 * that goes stale every time a country changes its rules.
 */
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid IANA timezone, e.g. America/Argentina/Buenos_Aires" },
  );

/** Opaque 64-byte token; bounded so a huge body cannot reach the hash step. */
export const refreshTokenSchema = z.string().trim().min(1, "Refresh token is required").max(512);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: displayNameSchema,
  workspaceName: displayNameSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Never apply the password policy on login: it would reject legacy passwords
  // and, worse, let an attacker distinguish "wrong shape" from "wrong password".
  password: z.string().min(1, "Password is required").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: refreshTokenSchema,
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = refreshSchema;
export type LogoutInput = z.infer<typeof logoutSchema>;

export const updateProfileSchema = z
  .object({
    name: displayNameSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.timezone !== undefined, {
    message: "Provide at least one field to update",
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(200),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
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
