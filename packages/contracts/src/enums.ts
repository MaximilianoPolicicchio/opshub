export const RoleName = ["OWNER", "ADMIN", "MEMBER"] as const;
export type RoleName = (typeof RoleName)[number];

export const ProjectType = [
  "PRODUCT",
  "CLIENT_PRODUCT",
  "AUTOMATION_SYSTEM",
  "INTERNAL_TOOL",
  "OTHER",
] as const;
export type ProjectType = (typeof ProjectType)[number];

export const ProjectStatus = ["ACTIVE", "MAINTENANCE", "PAUSED", "ARCHIVED"] as const;
export type ProjectStatus = (typeof ProjectStatus)[number];

export const ProjectHealth = ["HEALTHY", "NEEDS_ATTENTION", "BLOCKED"] as const;
export type ProjectHealth = (typeof ProjectHealth)[number];

export const Priority = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof Priority)[number];

export const TaskCategory = [
  "FEATURE",
  "BUG",
  "MAINTENANCE",
  "CLIENT_REQUEST",
  "AUTOMATION",
  "DEPLOYMENT",
  "DOCUMENTATION",
  "TECH_DEBT",
] as const;
export type TaskCategory = (typeof TaskCategory)[number];

export const TaskStatus = ["BACKLOG", "NEXT", "IN_PROGRESS", "WAITING", "REVIEW", "DONE"] as const;
export type TaskStatus = (typeof TaskStatus)[number];

export const MilestoneStatus = ["PLANNED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type MilestoneStatus = (typeof MilestoneStatus)[number];

export const BillingModel = ["FIXED_PRICE", "HOURLY", "INTERNAL"] as const;
export type BillingModel = (typeof BillingModel)[number];

export const RecurrenceUnit = ["DAY", "WEEK", "MONTH"] as const;
export type RecurrenceUnit = (typeof RecurrenceUnit)[number];

export const RecurrenceAnchor = ["DUE_DATE", "COMPLETION_DATE"] as const;
export type RecurrenceAnchor = (typeof RecurrenceAnchor)[number];

export const AutomationTrigger = [
  "TASK_OVERDUE_HIGH_PRIORITY",
  "PROJECT_HEALTH_CHANGED",
  "BUDGET_THRESHOLD_REACHED",
  "WEEKLY_REVIEW_GENERATED",
  "MANUAL",
] as const;
export type AutomationTrigger = (typeof AutomationTrigger)[number];

export const AutomationRunStatus = ["SUCCESS", "FAILED", "SIMULATED", "SKIPPED"] as const;
export type AutomationRunStatus = (typeof AutomationRunStatus)[number];

export const ActivityType = [
  "PROJECT_CREATED",
  "PROJECT_STATUS_CHANGED",
  "PROJECT_HEALTH_CHANGED",
  "TASK_CREATED",
  "TASK_STATUS_CHANGED",
  "TASK_PRIORITY_CHANGED",
  "TASK_BLOCKED",
  "TASK_UNBLOCKED",
  "TASK_COMPLETED",
  "TASK_RECURRED",
  "MILESTONE_COMPLETED",
  "TIME_ENTRY_LOGGED",
  "BUDGET_CREATED",
  "BUDGET_THRESHOLD_REACHED",
  "AUTOMATION_RUN",
  "WEEKLY_REVIEW_GENERATED",
] as const;
export type ActivityType = (typeof ActivityType)[number];

export const ProjectTemplateKey = [
  "product_development",
  "client_product",
  "automation_system",
  "internal_tool",
  "empty",
] as const;
export type ProjectTemplateKey = (typeof ProjectTemplateKey)[number];

export const CostFrequency = ["MONTHLY", "YEARLY"] as const;
export type CostFrequency = (typeof CostFrequency)[number];

export const CostCategory = [
  "HOSTING",
  "SAAS",
  "DOMAIN",
  "INFRASTRUCTURE",
  "MARKETING",
  "CONTRACTOR",
  "HARDWARE",
  "OTHER",
] as const;
export type CostCategory = (typeof CostCategory)[number];

export const ExpenseStatus = ["PENDING_REVIEW", "CONFIRMED", "REJECTED", "PAID"] as const;
export type ExpenseStatus = (typeof ExpenseStatus)[number];

export const ExpenseSource = ["MANUAL", "N8N_IMPORT", "FORWARDED_EMAIL"] as const;
export type ExpenseSource = (typeof ExpenseSource)[number];
