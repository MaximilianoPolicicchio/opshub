import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ExpenseStatus, ExpenseSource } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { monthRange, parseMonth, summariseMonth } from "./cost-summary.logic";

/**
 * Operating costs: vendors, recurring subscriptions, and real expenses.
 *
 * Every read is `findFirst({ id, workspaceId })` and every write carries
 * `workspaceId` in its own `where`, so a foreign id 404s rather than leaking or
 * mutating. `tenant-scoping.arch.spec.ts` enforces the write half.
 */
@Injectable()
export class CostsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vendor identity. Lowercased, trimmed, internal whitespace collapsed, so
   * "Vercel", " vercel " and "Vercel  Inc" do not become separate suppliers —
   * which would make price history meaningless.
   */
  private normalizeVendorName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, " ");
  }

  // ---------------------------------------------------------------- vendors

  async listVendors(workspaceId: string, includeArchived = false) {
    return this.prisma.vendor.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { name: "asc" },
      include: { _count: { select: { subscriptions: true, expenses: true } } },
    });
  }

  async createVendor(workspaceId: string, input: { name: string; website?: string | null; notes?: string | null }) {
    const normalizedName = this.normalizeVendorName(input.name);
    const existing = await this.prisma.vendor.findFirst({ where: { workspaceId, normalizedName } });
    if (existing) {
      throw new BadRequestException({
        code: "VENDOR_ALREADY_EXISTS",
        message: `A vendor named "${existing.name}" already exists`,
        details: { vendorId: existing.id },
      });
    }
    return this.prisma.vendor.create({
      data: {
        workspaceId,
        name: input.name.trim(),
        normalizedName,
        website: input.website ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  async updateVendor(
    id: string,
    workspaceId: string,
    input: { name?: string; website?: string | null; notes?: string | null },
  ) {
    await this.getVendorOr404(id, workspaceId);
    return this.prisma.vendor.update({
      where: { id, workspaceId },
      data: {
        ...(input.name !== undefined
          ? { name: input.name.trim(), normalizedName: this.normalizeVendorName(input.name) }
          : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
  }

  /**
   * Archive rather than delete: expenses reference the vendor, and losing the
   * supplier would orphan the history that makes price comparison possible.
   */
  async archiveVendor(id: string, workspaceId: string) {
    await this.getVendorOr404(id, workspaceId);
    return this.prisma.vendor.update({ where: { id, workspaceId }, data: { archivedAt: new Date() } });
  }

  private async getVendorOr404(id: string, workspaceId: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id, workspaceId } });
    if (!vendor) throw new NotFoundException({ code: "NOT_FOUND", message: "Vendor not found" });
    return vendor;
  }

  // ----------------------------------------------------------- subscriptions

  async listSubscriptions(workspaceId: string, filters: { projectId?: string; vendorId?: string; isActive?: boolean }) {
    return this.prisma.subscription.findMany({
      where: {
        workspaceId,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
        ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        vendor: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async createSubscription(workspaceId: string, input: Record<string, any>) {
    await this.getVendorOr404(input.vendorId, workspaceId);
    if (input.projectId) await this.assertProject(input.projectId, workspaceId);

    return this.prisma.subscription.create({
      data: {
        workspaceId,
        vendorId: input.vendorId,
        projectId: input.projectId ?? null,
        name: input.name,
        expectedAmount: new Prisma.Decimal(input.expectedAmount),
        currency: input.currency ?? "USD",
        frequency: input.frequency ?? "MONTHLY",
        category: input.category ?? "SAAS",
        isActive: input.isActive ?? true,
        nextChargeAt: input.nextChargeAt ? new Date(input.nextChargeAt) : null,
        notes: input.notes ?? null,
      },
      include: { vendor: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    });
  }

  async updateSubscription(id: string, workspaceId: string, input: Record<string, any>) {
    const existing = await this.prisma.subscription.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Subscription not found" });
    if (input.projectId) await this.assertProject(input.projectId, workspaceId);

    return this.prisma.subscription.update({
      where: { id, workspaceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.expectedAmount !== undefined
          ? { expectedAmount: new Prisma.Decimal(input.expectedAmount) }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.nextChargeAt !== undefined
          ? { nextChargeAt: input.nextChargeAt ? new Date(input.nextChargeAt) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { vendor: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    });
  }

  async deleteSubscription(id: string, workspaceId: string) {
    const existing = await this.prisma.subscription.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Subscription not found" });
    // Expenses keep their history: the relation is SetNull, not Cascade.
    await this.prisma.subscription.delete({ where: { id, workspaceId } });
    return { id };
  }

  // --------------------------------------------------------------- expenses

  async listExpenses(
    workspaceId: string,
    filters: { month?: string; projectId?: string; vendorId?: string; status?: ExpenseStatus; source?: ExpenseSource },
  ) {
    let dateFilter: Prisma.ExpenseWhereInput = {};
    if (filters.month) {
      const { year, month } = parseMonth(filters.month);
      const { start, end } = monthRange(year, month);
      dateFilter = { incurredAt: { gte: start, lt: end } };
    }

    return this.prisma.expense.findMany({
      where: {
        workspaceId,
        ...dateFilter,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.source ? { source: filters.source } : {}),
      },
      orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
      include: {
        vendor: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        subscription: { select: { id: true, name: true, expectedAmount: true, currency: true } },
      },
    });
  }

  /** The review queue: everything an importer or a human left undecided. */
  async listPendingReview(workspaceId: string) {
    return this.listExpenses(workspaceId, { status: "PENDING_REVIEW" });
  }

  async createExpense(workspaceId: string, input: Record<string, any>) {
    await this.getVendorOr404(input.vendorId, workspaceId);
    if (input.projectId) await this.assertProject(input.projectId, workspaceId);
    if (input.subscriptionId) {
      const sub = await this.prisma.subscription.findFirst({
        where: { id: input.subscriptionId, workspaceId },
      });
      if (!sub) throw new NotFoundException({ code: "NOT_FOUND", message: "Subscription not found" });
    }

    return this.prisma.expense.create({
      data: {
        workspaceId,
        vendorId: input.vendorId,
        subscriptionId: input.subscriptionId ?? null,
        projectId: input.projectId ?? null,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency ?? "USD",
        incurredAt: new Date(input.incurredAt),
        periodStart: input.periodStart ? new Date(input.periodStart) : null,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
        // Hand-entered rows are trusted; the client cannot choose either field.
        status: "CONFIRMED",
        source: "MANUAL",
        reviewedAt: new Date(),
        notes: input.notes ?? null,
      },
      include: { vendor: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    });
  }

  async updateExpense(id: string, workspaceId: string, input: Record<string, any>) {
    const existing = await this.prisma.expense.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Expense not found" });
    if (input.vendorId) await this.getVendorOr404(input.vendorId, workspaceId);
    if (input.projectId) await this.assertProject(input.projectId, workspaceId);

    return this.prisma.expense.update({
      where: { id, workspaceId },
      data: {
        ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
        ...(input.subscriptionId !== undefined ? { subscriptionId: input.subscriptionId } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.incurredAt !== undefined ? { incurredAt: new Date(input.incurredAt) } : {}),
        ...(input.periodStart !== undefined
          ? { periodStart: input.periodStart ? new Date(input.periodStart) : null }
          : {}),
        ...(input.periodEnd !== undefined
          ? { periodEnd: input.periodEnd ? new Date(input.periodEnd) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { vendor: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    });
  }

  /** Status changes go through their own endpoint so they are never incidental. */
  async reviewExpense(id: string, workspaceId: string, status: "CONFIRMED" | "REJECTED" | "PAID") {
    const existing = await this.prisma.expense.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Expense not found" });

    return this.prisma.expense.update({
      where: { id, workspaceId },
      data: { status, reviewedAt: new Date() },
      include: { vendor: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    });
  }

  async deleteExpense(id: string, workspaceId: string) {
    const existing = await this.prisma.expense.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException({ code: "NOT_FOUND", message: "Expense not found" });
    await this.prisma.expense.delete({ where: { id, workspaceId } });
    return { id };
  }

  // ---------------------------------------------------------------- summary

  /**
   * The monthly close. The maths lives in cost-summary.logic.ts; this method
   * only loads the rows and hands Decimals over as strings so no float ever
   * touches a monetary value.
   */
  async monthlySummary(workspaceId: string, month: string) {
    const { year, month: monthNumber } = parseMonth(month);
    const { start, end } = monthRange(year, monthNumber);

    const [subscriptions, expenses, projects, vendors] = await Promise.all([
      this.prisma.subscription.findMany({ where: { workspaceId } }),
      this.prisma.expense.findMany({ where: { workspaceId, incurredAt: { gte: start, lt: end } } }),
      this.prisma.project.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
      this.prisma.vendor.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    ]);

    const summary = summariseMonth({
      year,
      month: monthNumber,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        vendorId: s.vendorId,
        projectId: s.projectId,
        name: s.name,
        expectedAmount: s.expectedAmount.toFixed(2),
        currency: s.currency,
        frequency: s.frequency,
        isActive: s.isActive,
        nextChargeAt: s.nextChargeAt,
      })),
      expenses: expenses.map((e) => ({
        id: e.id,
        vendorId: e.vendorId,
        subscriptionId: e.subscriptionId,
        projectId: e.projectId,
        amount: e.amount.toFixed(2),
        currency: e.currency,
        incurredAt: e.incurredAt,
        status: e.status,
      })),
    });

    // Resolve ids to names here rather than in the pure logic, which stays
    // free of anything that needs a database.
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    const vendorNames = new Map(vendors.map((v) => [v.id, v.name]));

    return {
      ...summary,
      month,
      byProject: summary.byProject.map((r) => ({
        ...r,
        name: r.key ? (projectNames.get(r.key) ?? "Unknown project") : "Unassigned",
      })),
      byVendor: summary.byVendor.map((r) => ({
        ...r,
        name: r.key ? (vendorNames.get(r.key) ?? "Unknown vendor") : "Unassigned",
      })),
      priceIncreases: summary.priceIncreases.map((p) => ({
        ...p,
        vendorName: vendorNames.get(p.vendorId) ?? "Unknown vendor",
      })),
    };
  }

  private async assertProject(projectId: string, workspaceId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found" });
    return project;
  }
}
