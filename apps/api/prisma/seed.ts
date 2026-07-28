/* eslint-disable no-console */
import { PrismaClient, Priority, TaskCategory, TaskStatus, ActivityType } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { calculateBudgetBurn } from "../src/modules/budgets/budget-calculator.logic";
import { evaluateProjectHealth } from "../src/modules/projects/project-health.logic";

const prisma = new PrismaClient();

// Deterministic seeded PRNG (mulberry32) so demo data is reproducible.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ["*"],
  ADMIN: [
    "project:read",
    "project:write",
    "task:read",
    "task:write",
    "budget:read",
    "budget:write",
    "automation:read",
    "automation:write",
    "workspace:manage_members",
    "time_entry:read",
    "time_entry:write_any",
  ],
  MEMBER: [
    "project:read",
    "task:read",
    "task:write",
    "note:read",
    "note:write",
    "link:read",
    "link:write",
    "time_entry:read",
    "time_entry:write_own",
  ],
};

const TEMPLATES: {
  key: string;
  name: string;
  description: string;
  projectType: "PRODUCT" | "CLIENT_PRODUCT" | "AUTOMATION_SYSTEM" | "INTERNAL_TOOL" | "OTHER";
  starterTasks: { title: string; category: TaskCategory; priority: Priority; offsetDays?: number }[];
}[] = [
  {
    key: "product_development",
    name: "Product development",
    description: "Starter tasks for building a new product from scratch.",
    projectType: "PRODUCT",
    starterTasks: [
      { title: "Define MVP scope", category: "FEATURE", priority: "HIGH", offsetDays: 3 },
      { title: "Set up repository and CI", category: "DEPLOYMENT", priority: "HIGH", offsetDays: 5 },
      { title: "Design data model", category: "FEATURE", priority: "MEDIUM", offsetDays: 7 },
      { title: "Build core feature slice", category: "FEATURE", priority: "MEDIUM", offsetDays: 14 },
      { title: "Set up staging deploy", category: "DEPLOYMENT", priority: "MEDIUM", offsetDays: 18 },
      { title: "Write README", category: "DOCUMENTATION", priority: "LOW", offsetDays: 20 },
    ],
  },
  {
    key: "client_product",
    name: "Client product",
    description: "Starter tasks for a client engagement.",
    projectType: "CLIENT_PRODUCT",
    starterTasks: [
      { title: "Kickoff and requirements capture", category: "CLIENT_REQUEST", priority: "HIGH", offsetDays: 2 },
      { title: "Agree scope and budget", category: "CLIENT_REQUEST", priority: "HIGH", offsetDays: 5 },
      { title: "Set up environments", category: "DEPLOYMENT", priority: "MEDIUM", offsetDays: 7 },
      { title: "Build first deliverable", category: "FEATURE", priority: "MEDIUM", offsetDays: 20 },
      { title: "Client review round", category: "CLIENT_REQUEST", priority: "MEDIUM", offsetDays: 25 },
      { title: "Handover documentation", category: "DOCUMENTATION", priority: "LOW", offsetDays: 28 },
    ],
  },
  {
    key: "automation_system",
    name: "Automation system",
    description: "Starter tasks for building an n8n-style automation.",
    projectType: "AUTOMATION_SYSTEM",
    starterTasks: [
      { title: "Document workflow purpose", category: "DOCUMENTATION", priority: "MEDIUM", offsetDays: 2 },
      { title: "Validate credentials and secrets", category: "AUTOMATION", priority: "HIGH", offsetDays: 3 },
      { title: "Test happy path", category: "AUTOMATION", priority: "HIGH", offsetDays: 5 },
      { title: "Test failure path", category: "AUTOMATION", priority: "MEDIUM", offsetDays: 7 },
      { title: "Add monitoring", category: "MAINTENANCE", priority: "MEDIUM", offsetDays: 9 },
      { title: "Add maintenance checklist", category: "DOCUMENTATION", priority: "LOW", offsetDays: 10 },
    ],
  },
  {
    key: "internal_tool",
    name: "Internal tool",
    description: "Starter tasks for a small internal script or tool.",
    projectType: "INTERNAL_TOOL",
    starterTasks: [
      { title: "Define the internal problem", category: "FEATURE", priority: "MEDIUM", offsetDays: 1 },
      { title: "Sketch minimal UI", category: "FEATURE", priority: "LOW", offsetDays: 3 },
      { title: "Build core script", category: "FEATURE", priority: "MEDIUM", offsetDays: 6 },
      { title: "Add usage docs", category: "DOCUMENTATION", priority: "LOW", offsetDays: 8 },
    ],
  },
  {
    key: "empty",
    name: "Empty project",
    description: "No starter tasks; start from a blank slate.",
    projectType: "OTHER",
    starterTasks: [],
  },
];

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error("Refusing to seed a production database. Set ALLOW_PROD_SEED=true to override.");
  }

  console.log("--- OpsHub seed ---");
  const seedPassword = process.env.SEED_PASSWORD ?? "DemoPassword123!";
  console.log(`WARNING: seeding demo user with a well-known dev-only password (${seedPassword}). Never use in production.`);

  // 1. Roles
  for (const [name, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    await prisma.role.upsert({
      where: { name: name as any },
      update: { permissions },
      create: { name: name as any, permissions },
    });
  }
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: "OWNER" } });
  console.log("Seeded roles: OWNER, ADMIN, MEMBER");

  // 2. Templates (built-in, workspaceId = null)
  for (const t of TEMPLATES) {
    // Compound-unique lookup cannot target a NULL component, so built-in
    // (workspace-less) templates are matched explicitly.
    const existing = await prisma.projectTemplate.findFirst({
      where: { workspaceId: null, key: t.key },
      select: { id: true },
    });
    const fields = {
      name: t.name,
      description: t.description,
      projectType: t.projectType,
      starterTasks: t.starterTasks as any,
    };
    if (existing) {
      await prisma.projectTemplate.update({ where: { id: existing.id }, data: fields });
    } else {
      await prisma.projectTemplate.create({
        data: { workspaceId: null, key: t.key, isBuiltIn: true, ...fields },
      });
    }
  }
  const automationTemplate = TEMPLATES.find((t) => t.key === "automation_system")!;
  if (automationTemplate.starterTasks.length !== 6) {
    throw new Error("automation_system template must have exactly 6 starter tasks");
  }
  console.log("Seeded 5 project templates");

  // 3. Workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo-ops" },
    update: {},
    create: {
      name: "Demo Ops",
      slug: "demo-ops",
      timezone: "America/Argentina/Buenos_Aires",
      defaultCurrency: "USD",
    },
  });
  console.log(`Seeded workspace: ${workspace.name} (${workspace.slug})`);

  // 4. User
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@opshub.local" },
    update: { passwordHash },
    create: { email: "demo@opshub.local", name: "Demo Owner", passwordHash },
  });
  await prisma.membership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: user.id, roleId: ownerRole.id, acceptedAt: new Date() },
  });
  console.log(`Seeded user: ${user.email}`);

  // 5. Projects
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000);

  const hernanShop = await upsertProject(workspace.id, {
    name: "Hernan Shop",
    type: "CLIENT_PRODUCT",
    status: "ACTIVE",
    priority: "HIGH",
    description: "Demo e-commerce client product used for OpsHub seed data.",
    stakeholderLabel: "Hernan (demo stakeholder)",
    technologyTags: ["nextjs", "postgres", "stripe"],
    repositoryUrl: "https://github.com/demo/hernan-shop",
  });
  const maxusDental = await upsertProject(workspace.id, {
    name: "Maxus Dental",
    type: "CLIENT_PRODUCT",
    status: "ACTIVE",
    priority: "HIGH",
    description: "Demo dental clinic booking product used for OpsHub seed data.",
    stakeholderLabel: "Maxus Dental (demo stakeholder)",
    technologyTags: ["nextjs", "postgres"],
    repositoryUrl: "https://github.com/demo/maxus-dental",
  });
  const maxusMarket = await upsertProject(workspace.id, {
    name: "Maxus Market",
    type: "PRODUCT",
    status: "ACTIVE",
    priority: "MEDIUM",
    description: "Demo internal product used for OpsHub seed data.",
    technologyTags: ["nextjs", "postgres"],
    repositoryUrl: "https://github.com/demo/maxus-market",
  });
  const consultorioTemplate = await prisma.projectTemplate.findFirstOrThrow({
    where: { workspaceId: null, key: "automation_system" },
  });
  const consultorio = await upsertProject(
    workspace.id,
    {
      name: "Consultorio PYM Automations",
      type: "AUTOMATION_SYSTEM",
      status: "MAINTENANCE",
      priority: "MEDIUM",
      description: "Demo appointment-reminder automation system used for OpsHub seed data.",
      technologyTags: ["n8n", "postgres"],
    },
    consultorioTemplate.id,
  );

  console.log("Seeded 4 demo projects");

  // Generic task pool per project (8-14 tasks each), across all statuses/categories.
  await seedProjectTasks(hernanShop.id, workspace.id, [
    { title: "Fix cart total rounding", category: "BUG", priority: "HIGH", status: "IN_PROGRESS", dueDate: daysAgo(2), tags: ["checkout", "bug"] },
    { title: "Add coupon code support", category: "FEATURE", priority: "MEDIUM", status: "NEXT", dueDate: daysFromNow(10), tags: ["checkout"] },
    { title: "Refresh dependency versions", category: "TECH_DEBT", priority: "LOW", status: "BACKLOG", tags: ["maintenance"] },
    { title: "Investigate slow product search", category: "BUG", priority: "MEDIUM", status: "WAITING", dueDate: daysAgo(9), tags: ["performance"] },
    { title: "Write checkout integration tests", category: "FEATURE", priority: "MEDIUM", status: "REVIEW", tags: ["testing"] },
    { title: "Deploy hotfix for pricing bug", category: "DEPLOYMENT", priority: "HIGH", status: "DONE", completedAt: daysAgo(5), tags: ["deploy"] },
    { title: "Client requested new banner", category: "CLIENT_REQUEST", priority: "LOW", status: "BACKLOG", tags: ["marketing"] },
    { title: "Document order webhook format", category: "DOCUMENTATION", priority: "LOW", status: "BACKLOG", tags: ["docs"] },
    { title: "Improve mobile checkout layout", category: "FEATURE", priority: "MEDIUM", status: "NEXT", dueDate: daysFromNow(3), tags: ["mobile"] },
    { title: "Overdue: patch payment gateway timeout", category: "BUG", priority: "HIGH", status: "NEXT", dueDate: daysAgo(1), tags: ["bug", "urgent"] },
  ]);

  const [dentalPrereq] = await seedProjectTasks(maxusDental.id, workspace.id, [
    { title: "Migrate booking schema", category: "TECH_DEBT", priority: "HIGH", status: "IN_PROGRESS", dueDate: daysFromNow(2), tags: ["migration"] },
    { title: "Add appointment reminder job", category: "AUTOMATION", priority: "HIGH", status: "NEXT", dueDate: daysAgo(1), tags: ["automation"], blockedByFirst: true },
    { title: "Fix timezone bug in reminders", category: "BUG", priority: "MEDIUM", status: "BACKLOG", tags: ["bug"] },
    { title: "Add SMS confirmation flow", category: "FEATURE", priority: "MEDIUM", status: "BACKLOG", tags: ["sms"] },
    { title: "Refresh dependency versions", category: "TECH_DEBT", priority: "LOW", status: "BACKLOG", tags: ["maintenance"] },
    { title: "Client review: booking flow", category: "CLIENT_REQUEST", priority: "MEDIUM", status: "REVIEW", tags: ["client"] },
    { title: "Deploy staging environment", category: "DEPLOYMENT", priority: "MEDIUM", status: "DONE", completedAt: daysAgo(20), tags: ["deploy"] },
    { title: "Write API docs for booking", category: "DOCUMENTATION", priority: "LOW", status: "BACKLOG", tags: ["docs"] },
    { title: "Add waitlist feature", category: "FEATURE", priority: "LOW", status: "BACKLOG", tags: ["feature"] },
  ]);

  await seedProjectTasks(maxusMarket.id, workspace.id, [
    { title: "Design product listing page", category: "FEATURE", priority: "MEDIUM", status: "DONE", completedAt: daysAgo(15), tags: ["design"] },
    { title: "Build search indexing job", category: "FEATURE", priority: "MEDIUM", status: "IN_PROGRESS", tags: ["search"] },
    { title: "Add seller onboarding flow", category: "FEATURE", priority: "MEDIUM", status: "NEXT", dueDate: daysFromNow(12), tags: ["onboarding"] },
    { title: "Refresh dependency versions", category: "TECH_DEBT", priority: "LOW", status: "BACKLOG", tags: ["maintenance"] },
    { title: "Write README", category: "DOCUMENTATION", priority: "LOW", status: "DONE", completedAt: daysAgo(30), tags: ["docs"] },
    { title: "Set up staging deploy", category: "DEPLOYMENT", priority: "MEDIUM", status: "DONE", completedAt: daysAgo(28), tags: ["deploy"] },
    { title: "Add analytics dashboard", category: "FEATURE", priority: "LOW", status: "BACKLOG", tags: ["analytics"] },
    { title: "Improve image upload speed", category: "BUG", priority: "MEDIUM", status: "BACKLOG", tags: ["performance"] },
  ]);

  // Seeded from the automation_system template: the first six tasks are exactly
  // the template's starter checklist, in order (asserted below).
  await seedProjectTasks(consultorio.id, workspace.id, [
    { title: "Document workflow purpose", category: "DOCUMENTATION", priority: "MEDIUM", status: "DONE", completedAt: daysAgo(24), tags: ["docs"] },
    { title: "Validate credentials and secrets", category: "AUTOMATION", priority: "HIGH", status: "DONE", completedAt: daysAgo(18), tags: ["security"] },
    { title: "Test happy path", category: "AUTOMATION", priority: "MEDIUM", status: "DONE", completedAt: daysAgo(12), tags: ["automation"] },
    { title: "Test failure path", category: "AUTOMATION", priority: "MEDIUM", status: "IN_PROGRESS", tags: ["automation"] },
    { title: "Add monitoring", category: "MAINTENANCE", priority: "MEDIUM", status: "NEXT", dueDate: daysFromNow(5), tags: ["monitoring"] },
    { title: "Add maintenance checklist", category: "MAINTENANCE", priority: "LOW", status: "BACKLOG", tags: ["maintenance"] },
    { title: "Refresh dependency versions", category: "TECH_DEBT", priority: "LOW", status: "BACKLOG", tags: ["maintenance"] },
  ], /* skipTemplateTasks */ true);

  const consultorioTitles = (
    await prisma.task.findMany({
      where: { projectId: consultorio.id },
      orderBy: { sortOrder: "asc" },
      select: { title: true },
      take: 6,
    })
  ).map((t) => t.title);
  const expectedStarterTitles = (consultorioTemplate.starterTasks as { title: string }[]).map((t) => t.title);
  if (consultorioTitles.join("|") !== expectedStarterTitles.join("|")) {
    throw new Error(
      `Automation System starter tasks mismatch.\n  expected: ${expectedStarterTitles.join(", ")}\n  actual:   ${consultorioTitles.join(", ")}`,
    );
  }

  // One recurring task per workspace.
  const recurringOwner = maxusMarket;
  await prisma.task.upsert({
    where: { recurrenceSeriesId_occurrenceIndex: { recurrenceSeriesId: "seed-weekly-check", occurrenceIndex: 0 } },
    update: {},
    create: {
      workspaceId: workspace.id,
      projectId: recurringOwner.id,
      title: "Weekly dependency and backup check",
      category: "MAINTENANCE",
      priority: "MEDIUM",
      status: "NEXT",
      dueDate: daysFromNow(3),
      recurrenceUnit: "WEEK",
      recurrenceInterval: 1,
      recurrenceAnchor: "DUE_DATE",
      recurrenceSeriesId: "seed-weekly-check",
      occurrenceIndex: 0,
      tags: ["recurring", "maintenance"],
    },
  });
  console.log("Seeded recurring task");

  // Milestones: 2 each on Hernan Shop and Maxus Market.
  await seedMilestones(hernanShop.id, workspace.id, [
    { title: "Launch v1", targetDate: daysFromNow(30), status: "IN_PROGRESS" },
    { title: "Post-launch stabilization", targetDate: daysFromNow(60), status: "PLANNED" },
  ]);
  await seedMilestones(maxusMarket.id, workspace.id, [
    { title: "Seller beta", targetDate: daysAgo(10), status: "DONE" },
    { title: "Public launch", targetDate: daysFromNow(45), status: "PLANNED" },
  ]);
  console.log("Seeded milestones");

  // Notes and links.
  await prisma.note.createMany({
    data: [
      { workspaceId: workspace.id, projectId: hernanShop.id, authorId: user.id, title: "Kickoff notes", body: "Client wants coupon codes before the Q3 sale.", pinned: true },
      { workspaceId: workspace.id, projectId: maxusDental.id, authorId: user.id, title: "Booking flow decisions", body: "Reminders should fire 24h before appointment.", pinned: false },
      { workspaceId: workspace.id, projectId: maxusMarket.id, authorId: user.id, title: "Roadmap ideas", body: "Consider seller analytics dashboard for v2.", pinned: false },
      { workspaceId: workspace.id, projectId: consultorio.id, authorId: user.id, title: "Runbook", body: "If the reminder job fails, check the n8n execution log first.", pinned: true },
    ],
    skipDuplicates: true,
  });
  const anyHernanTask = await prisma.task.findFirst({ where: { projectId: hernanShop.id } });
  if (anyHernanTask) {
    await prisma.taskLink.createMany({
      data: [
        { workspaceId: workspace.id, taskId: anyHernanTask.id, label: "PR #142", url: "https://github.com/demo/hernan-shop/pull/142" },
        { workspaceId: workspace.id, taskId: anyHernanTask.id, label: "Design mock", url: "https://demo.example.com/mocks/cart" },
      ],
      skipDuplicates: true,
    });
  }
  console.log("Seeded notes and links");

  // 6. Time entries (~45 closed entries over the last 6 weeks, deterministic, non-overlapping).
  await seedTimeEntries(workspace.id, user.id, [
    { project: hernanShop, targetHours: 68 }, // ~62% of 110h estimate
    { project: maxusDental, targetHours: 70 }, // ~78% of 90h estimate
    { project: maxusMarket, targetHours: 60 }, // internal-only, no % target
    { project: consultorio, targetHours: 12 }, // ~30% of 40h estimate
  ]);
  console.log("Seeded time entries");

  // 7. Budgets
  await prisma.projectBudget.upsert({
    where: { projectId: hernanShop.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      projectId: hernanShop.id,
      billingModel: "HOURLY",
      currency: "USD",
      budgetAmount: 6000,
      hourlyRate: 55,
      estimatedHours: 110,
    },
  });
  await prisma.projectBudget.upsert({
    where: { projectId: maxusDental.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      projectId: maxusDental.id,
      billingModel: "FIXED_PRICE",
      currency: "USD",
      budgetAmount: 4500,
      estimatedHours: 90,
    },
  });
  await prisma.projectBudget.upsert({
    where: { projectId: maxusMarket.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      projectId: maxusMarket.id,
      billingModel: "INTERNAL",
      currency: "USD",
      estimatedHours: 200,
      hourlyRate: 0,
    },
  });
  await prisma.projectBudget.upsert({
    where: { projectId: consultorio.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      projectId: consultorio.id,
      billingModel: "HOURLY",
      currency: "USD",
      budgetAmount: 2400,
      hourlyRate: 60,
      estimatedHours: 40,
    },
  });
  console.log("Seeded budgets");

  // 8. Automations + historical runs
  const automations = await Promise.all([
    prisma.automation.upsert({
      where: { id: "seed-automation-overdue" },
      update: {},
      create: { id: "seed-automation-overdue", workspaceId: workspace.id, name: "Escalate overdue high-priority", trigger: "TASK_OVERDUE_HIGH_PRIORITY" },
    }),
    prisma.automation.upsert({
      where: { id: "seed-automation-health" },
      update: {},
      create: { id: "seed-automation-health", workspaceId: workspace.id, name: "Notify on health change", trigger: "PROJECT_HEALTH_CHANGED" },
    }),
    prisma.automation.upsert({
      where: { id: "seed-automation-budget" },
      update: {},
      create: { id: "seed-automation-budget", workspaceId: workspace.id, name: "Budget threshold alert", trigger: "BUDGET_THRESHOLD_REACHED" },
    }),
    prisma.automation.upsert({
      where: { id: "seed-automation-weekly" },
      update: {},
      create: { id: "seed-automation-weekly", workspaceId: workspace.id, name: "Weekly review digest", trigger: "WEEKLY_REVIEW_GENERATED" },
    }),
  ]);
  console.log("Seeded 4 automations");

  const runStatuses: ("SUCCESS" | "SIMULATED" | "FAILED")[] = [
    ...Array(7).fill("SUCCESS"),
    ...Array(4).fill("SIMULATED"),
    "FAILED",
  ];
  for (let i = 0; i < runStatuses.length; i++) {
    const automation = automations[i % automations.length];
    const status = runStatuses[i];
    const startedAt = daysAgo(rand() * 30);
    const durationMs = 120 + Math.floor(rand() * 900);
    await prisma.automationRun.create({
      data: {
        workspaceId: workspace.id,
        automationId: automation.id,
        trigger: automation.trigger,
        status,
        simulated: status === "SIMULATED",
        requestPayload: { eventType: automation.trigger, seeded: true, index: i },
        responseStatus: status === "SUCCESS" ? 200 : status === "FAILED" ? 500 : null,
        errorMessage: status === "FAILED" ? "Simulated failure: connection timeout" : null,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + durationMs),
        durationMs,
      },
    });
  }

  // Keep the denormalized lastRunAt consistent with the history just written,
  // otherwise the Automations view reports "Never run" despite having runs.
  for (const automation of automations) {
    const latest = await prisma.automationRun.findFirst({
      where: { automationId: automation.id },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (latest) {
      await prisma.automation.update({
        where: { id: automation.id },
        data: { lastRunAt: latest.startedAt },
      });
    }
  }
  console.log("Seeded ~12 historical automation runs");

  // 9. Operating costs. Every figure below is invented. See docs/costs.md.
  //
  // Shaped so the Costs page has something to show on a fresh database: one
  // price rise to flag, one item waiting in the review queue, one yearly
  // renewal, and shared infrastructure with no project so the Unassigned
  // bucket is visible rather than theoretical.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayThisMonth = (day: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));

  const vendorSpecs = [
    { key: "vercel", name: "Vercel" },
    { key: "supabase", name: "Supabase" },
    { key: "namecheap", name: "Namecheap" },
    { key: "twilio", name: "Twilio" },
    { key: "figma", name: "Figma" },
  ];
  const vendors: Record<string, { id: string }> = {};
  for (const v of vendorSpecs) {
    const normalizedName = v.name.trim().toLowerCase().replace(/\s+/g, " ");
    const existing = await prisma.vendor.findFirst({
      where: { workspaceId: workspace.id, normalizedName },
      select: { id: true },
    });
    vendors[v.key] = existing
      ? existing
      : await prisma.vendor.create({
          data: { workspaceId: workspace.id, name: v.name, normalizedName },
          select: { id: true },
        });
  }
  console.log(`Seeded ${vendorSpecs.length} vendors`);

  const subscriptionSpecs = [
    // The price rise: expected 20, actually charged 25 below.
    { key: "vercelPro", vendor: "vercel", project: hernanShop.id, name: "Vercel Pro", amount: "20.00", frequency: "MONTHLY" as const, category: "HOSTING" as const },
    { key: "supabaseDental", vendor: "supabase", project: maxusDental.id, name: "Supabase Pro", amount: "25.00", frequency: "MONTHLY" as const, category: "INFRASTRUCTURE" as const },
    { key: "twilioSms", vendor: "twilio", project: consultorio.id, name: "Twilio SMS", amount: "15.00", frequency: "MONTHLY" as const, category: "SAAS" as const },
    // Shared design tooling: deliberately unassigned.
    { key: "figma", vendor: "figma", project: null, name: "Figma Professional", amount: "12.00", frequency: "MONTHLY" as const, category: "SAAS" as const },
    // Yearly, with a charge date so it is schedulable.
    { key: "domain", vendor: "namecheap", project: maxusMarket.id, name: "Domain renewal", amount: "18.00", frequency: "YEARLY" as const, category: "DOMAIN" as const },
  ];
  const subs: Record<string, { id: string }> = {};
  for (const spec of subscriptionSpecs) {
    const existing = await prisma.subscription.findFirst({
      where: { workspaceId: workspace.id, name: spec.name },
      select: { id: true },
    });
    const data = {
      workspaceId: workspace.id,
      vendorId: vendors[spec.vendor]!.id,
      projectId: spec.project,
      name: spec.name,
      expectedAmount: spec.amount,
      currency: "USD",
      frequency: spec.frequency,
      category: spec.category,
      isActive: true,
      nextChargeAt: spec.frequency === "YEARLY" ? dayThisMonth(22) : null,
    };
    subs[spec.key] = existing
      ? await prisma.subscription.update({ where: { id: existing.id, workspaceId: workspace.id }, data, select: { id: true } })
      : await prisma.subscription.create({ data, select: { id: true } });
  }
  console.log(`Seeded ${subscriptionSpecs.length} subscriptions`);

  const expenseSpecs = [
    // Charged 25 against an expected 20 -> flagged as a price increase.
    { ref: "seed-vercel", vendor: "vercel", sub: "vercelPro", project: hernanShop.id, amount: "25.00", day: 4, status: "CONFIRMED" as const, notes: "Plan price went up" },
    { ref: "seed-supabase", vendor: "supabase", sub: "supabaseDental", project: maxusDental.id, amount: "25.00", day: 3, status: "PAID" as const, notes: null },
    { ref: "seed-twilio", vendor: "twilio", sub: "twilioSms", project: consultorio.id, amount: "15.00", day: 6, status: "CONFIRMED" as const, notes: null },
    { ref: "seed-figma", vendor: "figma", sub: "figma", project: null, amount: "12.00", day: 2, status: "CONFIRMED" as const, notes: "Shared across projects" },
    // Waiting in the review queue, so it is excluded from the totals on purpose.
    { ref: "seed-review", vendor: "twilio", sub: null, project: null, amount: "48.00", day: 9, status: "PENDING_REVIEW" as const, notes: "Unexpected overage charge" },
  ];
  for (const spec of expenseSpecs) {
    const existing = await prisma.expense.findFirst({
      where: { workspaceId: workspace.id, externalReference: spec.ref },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.expense.create({
      data: {
        workspaceId: workspace.id,
        vendorId: vendors[spec.vendor]!.id,
        subscriptionId: spec.sub ? subs[spec.sub]!.id : null,
        projectId: spec.project,
        amount: spec.amount,
        currency: "USD",
        incurredAt: dayThisMonth(spec.day),
        periodStart: monthStart,
        status: spec.status,
        // MANUAL, not N8N_IMPORT: no importer exists, and the seed must not
        // imply one ever ran.
        source: "MANUAL",
        externalReference: spec.ref,
        reviewedAt: spec.status === "PENDING_REVIEW" ? null : dayThisMonth(spec.day),
        notes: spec.notes,
      },
    });
  }
  console.log(`Seeded ${expenseSpecs.length} expenses (1 awaiting review, 1 price increase)`);

  // 8b. Run the real evaluators (also serves as an e2e smoke test of those code paths).
  for (const project of [hernanShop, maxusDental, maxusMarket, consultorio]) {
    await evaluateAndPersistHealth(project.id, workspace.id);
    await evaluateAndPersistBudgetAlerts(project.id, workspace.id);
  }
  console.log("Ran health evaluator and budget alert evaluator for all seed projects");

  await seedActivityEvents(workspace.id, user.id);
  console.log("Seeded activity history");

  console.log("--- Seed complete ---");
}

// --- Helpers --------------------------------------------------------------

async function upsertProject(
  workspaceId: string,
  data: {
    name: string;
    type: "PRODUCT" | "CLIENT_PRODUCT" | "AUTOMATION_SYSTEM" | "INTERNAL_TOOL" | "OTHER";
    status: "ACTIVE" | "MAINTENANCE" | "PAUSED" | "ARCHIVED";
    priority: Priority;
    description?: string;
    stakeholderLabel?: string;
    technologyTags?: string[];
    repositoryUrl?: string;
  },
  templateId?: string,
) {
  return prisma.project.upsert({
    where: { workspaceId_name: { workspaceId, name: data.name } },
    update: {},
    create: {
      workspaceId,
      name: data.name,
      type: data.type,
      status: data.status,
      priority: data.priority,
      description: data.description,
      stakeholderLabel: data.stakeholderLabel,
      technologyTags: data.technologyTags ?? [],
      repositoryUrl: data.repositoryUrl,
      templateId,
    },
  });
}

async function seedProjectTasks(
  projectId: string,
  workspaceId: string,
  defs: {
    title: string;
    category: TaskCategory;
    priority: Priority;
    status: TaskStatus;
    dueDate?: Date;
    completedAt?: Date;
    tags?: string[];
    blockedByFirst?: boolean;
  }[],
  skipTemplateSeeding = false,
): Promise<{ id: string; title: string }[]> {
  const existing = await prisma.task.count({ where: { projectId } });
  if (existing > 0 && skipTemplateSeeding) {
    return prisma.task.findMany({ where: { projectId }, select: { id: true, title: true } });
  }

  const created: { id: string; title: string }[] = [];
  let sortOrder = existing;
  for (const def of defs) {
    const existingTask = await prisma.task.findFirst({ where: { projectId, title: def.title } });
    if (existingTask) {
      created.push(existingTask);
      continue;
    }
    const task = await prisma.task.create({
      data: {
        workspaceId,
        projectId,
        title: def.title,
        category: def.category,
        priority: def.priority,
        status: def.status,
        dueDate: def.dueDate ?? null,
        completedAt: def.completedAt ?? null,
        tags: def.tags ?? [],
        sortOrder: sortOrder++,
      },
    });
    created.push(task);
  }

  const first = created[0];
  const blockedTaskIdx = defs.findIndex((d) => d.blockedByFirst);
  if (blockedTaskIdx > 0 && first) {
    const blockedTask = created[blockedTaskIdx];
    const existingDep = await prisma.taskDependency.findFirst({
      where: { taskId: blockedTask.id, dependsOnTaskId: first.id },
    });
    if (!existingDep) {
      await prisma.taskDependency.create({
        data: { workspaceId, taskId: blockedTask.id, dependsOnTaskId: first.id },
      });
      await prisma.task.update({ where: { id: blockedTask.id }, data: { isBlocked: true } });
    }
  }

  return created;
}

async function seedMilestones(
  projectId: string,
  workspaceId: string,
  defs: { title: string; targetDate: Date; status: "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELLED" }[],
) {
  let sortOrder = 0;
  for (const def of defs) {
    const existing = await prisma.milestone.findFirst({ where: { projectId, title: def.title } });
    if (existing) continue;
    await prisma.milestone.create({
      data: {
        workspaceId,
        projectId,
        title: def.title,
        targetDate: def.targetDate,
        status: def.status,
        completedAt: def.status === "DONE" ? def.targetDate : null,
        sortOrder: sortOrder++,
      },
    });
  }
}

async function seedTimeEntries(
  workspaceId: string,
  userId: string,
  plans: { project: { id: string }; targetHours: number }[],
) {
  const existingCount = await prisma.timeEntry.count({ where: { workspaceId } });
  if (existingCount > 0) return; // idempotent: don't double-seed on re-run

  // One shared cursor per calendar day across ALL projects: the same user cannot
  // be in two places at once, and the DB enforces that with an exclusion constraint.
  const dayCursors = new Map<number, Date>();
  const cursorFor = (dayOffset: number) => {
    let cursor = dayCursors.get(dayOffset);
    if (!cursor) {
      cursor = new Date();
      cursor.setDate(cursor.getDate() - dayOffset);
      cursor.setHours(9, 0, 0, 0);
    }
    return cursor;
  };

  for (const plan of plans) {
    let remainingMinutes = plan.targetHours * 60;
    let dayOffset = 41; // ~6 weeks back
    while (remainingMinutes > 0 && dayOffset >= 0) {
      // 0-2 entries per day, skip some days entirely (weekends-ish via PRNG).
      if (rand() < 0.3) {
        dayOffset--;
        continue;
      }

      const entriesToday = 1 + Math.floor(rand() * 2);
      let cursor = cursorFor(dayOffset);
      for (let i = 0; i < entriesToday && remainingMinutes > 0; i++) {
        // Stop filling a day once it runs past a plausible working window.
        if (cursor.getHours() >= 20) break;
        const duration = Math.min(25 + Math.floor(rand() * 155), remainingMinutes); // 25-180 min
        const start = new Date(cursor);
        const end = new Date(start.getTime() + duration * 60000);
        await prisma.timeEntry.create({
          data: {
            workspaceId,
            projectId: plan.project.id,
            userId,
            startTime: start,
            endTime: end,
            durationMinutes: duration,
            billable: rand() > 0.2,
          },
        });
        remainingMinutes -= duration;
        // gap of 15-45 min before the next entry, keeps entries non-overlapping.
        cursor = new Date(end.getTime() + (15 + Math.floor(rand() * 30)) * 60000);
        dayCursors.set(dayOffset, cursor);
      }
      dayOffset--;
    }
  }
}

/**
 * Derives a plausible activity history from data already seeded, so the Today
 * feed and per-project timelines have real content on first run. Timestamps are
 * taken from the underlying rows rather than invented, keeping the feed
 * consistent with the data it describes.
 */
async function seedActivityEvents(workspaceId: string, actorId: string) {
  if ((await prisma.activityEvent.count({ where: { workspaceId } })) > 0) return;

  const events: {
    projectId: string | null;
    type: ActivityType;
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }[] = [];

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true, name: true, health: true, healthReason: true, createdAt: true },
  });
  for (const p of projects) {
    events.push({
      projectId: p.id,
      type: "PROJECT_CREATED",
      entityType: "Project",
      entityId: p.id,
      summary: `Project "${p.name}" created`,
      createdAt: p.createdAt,
    });
    if (p.health !== "HEALTHY") {
      events.push({
        projectId: p.id,
        type: "PROJECT_HEALTH_CHANGED",
        entityType: "Project",
        entityId: p.id,
        summary: `${p.name} health changed to ${p.health}`,
        metadata: { from: "HEALTHY", to: p.health, reason: p.healthReason },
        createdAt: new Date(Date.now() - 86400000),
      });
    }
  }

  const completed = await prisma.task.findMany({
    where: { workspaceId, status: "DONE", completedAt: { not: null } },
    select: { id: true, title: true, projectId: true, completedAt: true },
  });
  for (const t of completed) {
    events.push({
      projectId: t.projectId,
      type: "TASK_COMPLETED",
      entityType: "Task",
      entityId: t.id,
      summary: `Completed "${t.title}"`,
      createdAt: t.completedAt!,
    });
  }

  const blocked = await prisma.task.findMany({
    where: { workspaceId, isBlocked: true },
    select: { id: true, title: true, projectId: true, updatedAt: true },
  });
  for (const t of blocked) {
    events.push({
      projectId: t.projectId,
      type: "TASK_BLOCKED",
      entityType: "Task",
      entityId: t.id,
      summary: `"${t.title}" is blocked by an open dependency`,
      createdAt: t.updatedAt,
    });
  }

  // Only the most recent time entries — the feed should not be a time log.
  const recentTime = await prisma.timeEntry.findMany({
    where: { workspaceId, endTime: { not: null } },
    orderBy: { startTime: "desc" },
    take: 15,
    select: { id: true, projectId: true, durationMinutes: true, startTime: true },
  });
  for (const e of recentTime) {
    const h = Math.floor((e.durationMinutes ?? 0) / 60);
    const m = (e.durationMinutes ?? 0) % 60;
    events.push({
      projectId: e.projectId,
      type: "TIME_ENTRY_LOGGED",
      entityType: "TimeEntry",
      entityId: e.id,
      summary: `Logged ${h > 0 ? `${h}h ` : ""}${m}m`,
      createdAt: e.startTime,
    });
  }

  const budgets = await prisma.projectBudget.findMany({
    where: { workspaceId },
    select: { id: true, projectId: true, createdAt: true, project: { select: { name: true } } },
  });
  for (const b of budgets) {
    events.push({
      projectId: b.projectId,
      type: "BUDGET_CREATED",
      entityType: "ProjectBudget",
      entityId: b.id,
      summary: `Budget created for ${b.project.name}`,
      createdAt: b.createdAt,
    });
  }

  const alerts = await prisma.budgetAlert.findMany({
    where: { workspaceId },
    select: {
      id: true,
      threshold: true,
      triggeredAt: true,
      budget: { select: { projectId: true, project: { select: { name: true } } } },
    },
  });
  for (const a of alerts) {
    events.push({
      projectId: a.budget.projectId,
      type: "BUDGET_THRESHOLD_REACHED",
      entityType: "BudgetAlert",
      entityId: a.id,
      summary: `${a.budget.project.name} reached ${a.threshold}% of budget`,
      metadata: { threshold: a.threshold },
      createdAt: a.triggeredAt,
    });
  }

  await prisma.activityEvent.createMany({
    data: events.map((e) => ({
      workspaceId,
      actorId,
      projectId: e.projectId,
      type: e.type,
      entityType: e.entityType,
      entityId: e.entityId,
      summary: e.summary,
      metadata: (e.metadata ?? {}) as any,
      createdAt: e.createdAt,
    })),
  });
}

async function evaluateAndPersistHealth(projectId: string, workspaceId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [highBlockedOpen, highWaiting, highOverdue, overdueOpen, budget] = await Promise.all([
    prisma.task.count({ where: { projectId, archivedAt: null, status: { not: "DONE" }, priority: { in: ["CRITICAL", "HIGH"] }, isBlocked: true } }),
    prisma.task.findMany({ where: { projectId, archivedAt: null, status: "WAITING", priority: { in: ["CRITICAL", "HIGH"] } }, select: { updatedAt: true } }),
    prisma.task.count({ where: { projectId, archivedAt: null, status: { not: "DONE" }, priority: { in: ["CRITICAL", "HIGH"] }, dueDate: { lt: startOfToday } } }),
    prisma.task.count({ where: { projectId, archivedAt: null, status: { not: "DONE" }, dueDate: { lt: startOfToday } } }),
    prisma.projectBudget.findFirst({ where: { projectId } }),
  ]);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const highPriorityWaitingStale = highWaiting.filter((t) => t.updatedAt < sevenDaysAgo).length;

  let budgetBurnPercent: number | null = null;
  if (budget && budget.billingModel !== "INTERNAL") {
    const burn = await computeBurnForSeed(budget);
    budgetBurnPercent = burn.burnPercent.toNumber();
  }

  const result = evaluateProjectHealth({
    status: project.status,
    counts: { highPriorityBlockedOpen: highBlockedOpen, highPriorityWaitingStale, highPriorityOverdue: highOverdue, overdueOpen },
    budgetBurnPercent,
    lastActivityAt: project.lastActivityAt,
    now,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { health: result.health, healthReason: result.reason, healthEvaluatedAt: now },
  });
}

async function computeBurnForSeed(budget: any) {
  const entries = await prisma.timeEntry.findMany({
    where: { projectId: budget.projectId, endTime: { not: null } },
    select: { durationMinutes: true, billable: true },
  });
  const trackedMinutes = entries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const billableMinutes = entries.filter((e) => e.billable).reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  return calculateBudgetBurn({
    billingModel: budget.billingModel,
    budgetAmount: budget.budgetAmount,
    hourlyRate: budget.hourlyRate,
    estimatedHours: budget.estimatedHours,
    trackedMinutes,
    billableMinutes,
  });
}

async function evaluateAndPersistBudgetAlerts(projectId: string, workspaceId: string) {
  const budget = await prisma.projectBudget.findFirst({ where: { projectId } });
  if (!budget || budget.billingModel === "INTERNAL") return;
  const burn = await computeBurnForSeed(budget);
  const thresholds = [...budget.alertThresholds].sort((a, b) => a - b);
  for (const threshold of thresholds) {
    if (burn.burnPercent.lt(threshold)) continue;
    await prisma.budgetAlert.createMany({
      data: [
        {
          workspaceId,
          projectBudgetId: budget.id,
          threshold,
          burnPercentAtFire: burn.burnPercent.toDecimalPlaces(2).toNumber(),
          amountAtFire: burn.trackedValue?.toNumber() ?? 0,
        },
      ],
      skipDuplicates: true,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
