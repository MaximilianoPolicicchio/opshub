import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createVendorSchema,
  updateVendorSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  createExpenseSchema,
  updateExpenseSchema,
  reviewExpenseSchema,
  monthSchema,
  type CreateVendorInput,
  type UpdateVendorInput,
  type CreateSubscriptionInput,
  type UpdateSubscriptionInput,
  type CreateExpenseInput,
  type UpdateExpenseInput,
  type ReviewExpenseInput,
} from "@opshub/contracts";
import { ExpenseSource, ExpenseStatus } from "@prisma/client";
import { WorkspaceId } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CostsService } from "./costs.service";

/**
 * `workspaceId` always comes from the guard, never from a body or query — a
 * client cannot assert which workspace it is writing to.
 */
@Controller()
export class CostsController {
  constructor(private readonly costs: CostsService) {}

  /**
   * Query strings do not go through ZodValidationPipe, which only sees the
   * body. Calling `schema.parse` directly throws a raw ZodError that Nest turns
   * into a 500, so a mistyped month looked like a server fault. This maps it to
   * the same 400 envelope every other validation failure produces.
   */
  private parseMonth(value: string): string {
    const result = monthSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Invalid month, expected YYYY-MM",
        details: result.error.flatten(),
      });
    }
    return result.data;
  }

  // ---------------------------------------------------------------- vendors

  @Get("costs/vendors")
  listVendors(@WorkspaceId() workspaceId: string, @Query("includeArchived") includeArchived?: string) {
    return this.costs.listVendors(workspaceId, includeArchived === "true");
  }

  @Post("costs/vendors")
  createVendor(
    @WorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(createVendorSchema)) body: CreateVendorInput,
  ) {
    return this.costs.createVendor(workspaceId, body);
  }

  @Patch("costs/vendors/:id")
  updateVendor(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateVendorSchema)) body: UpdateVendorInput,
  ) {
    return this.costs.updateVendor(id, workspaceId, body);
  }

  @Delete("costs/vendors/:id")
  archiveVendor(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.costs.archiveVendor(id, workspaceId);
  }

  // ----------------------------------------------------------- subscriptions

  @Get("costs/subscriptions")
  listSubscriptions(
    @WorkspaceId() workspaceId: string,
    @Query("projectId") projectId?: string,
    @Query("vendorId") vendorId?: string,
    @Query("isActive") isActive?: string,
  ) {
    return this.costs.listSubscriptions(workspaceId, {
      projectId,
      vendorId,
      isActive: isActive === undefined ? undefined : isActive === "true",
    });
  }

  @Post("costs/subscriptions")
  createSubscription(
    @WorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(createSubscriptionSchema)) body: CreateSubscriptionInput,
  ) {
    return this.costs.createSubscription(workspaceId, body);
  }

  @Patch("costs/subscriptions/:id")
  updateSubscription(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema)) body: UpdateSubscriptionInput,
  ) {
    return this.costs.updateSubscription(id, workspaceId, body);
  }

  @Delete("costs/subscriptions/:id")
  deleteSubscription(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.costs.deleteSubscription(id, workspaceId);
  }

  // --------------------------------------------------------------- expenses

  @Get("costs/expenses")
  listExpenses(
    @WorkspaceId() workspaceId: string,
    @Query("month") month?: string,
    @Query("projectId") projectId?: string,
    @Query("vendorId") vendorId?: string,
    @Query("status") status?: ExpenseStatus,
    @Query("source") source?: ExpenseSource,
  ) {
    // Validated rather than passed straight through: a malformed month would
    // otherwise reach parseMonth and surface as a 500.
    const parsedMonth = month ? this.parseMonth(month) : undefined;
    return this.costs.listExpenses(workspaceId, {
      month: parsedMonth,
      projectId,
      vendorId,
      status,
      source,
    });
  }

  @Get("costs/expenses/pending-review")
  listPendingReview(@WorkspaceId() workspaceId: string) {
    return this.costs.listPendingReview(workspaceId);
  }

  @Post("costs/expenses")
  createExpense(
    @WorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
  ) {
    return this.costs.createExpense(workspaceId, body);
  }

  @Patch("costs/expenses/:id")
  updateExpense(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateExpenseSchema)) body: UpdateExpenseInput,
  ) {
    return this.costs.updateExpense(id, workspaceId, body);
  }

  @Post("costs/expenses/:id/review")
  reviewExpense(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewExpenseSchema)) body: ReviewExpenseInput,
  ) {
    return this.costs.reviewExpense(id, workspaceId, body.status);
  }

  @Delete("costs/expenses/:id")
  deleteExpense(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.costs.deleteExpense(id, workspaceId);
  }

  // ---------------------------------------------------------------- summary

  @Get("costs/summary")
  summary(@WorkspaceId() workspaceId: string, @Query("month") month?: string) {
    const target = month ? this.parseMonth(month) : new Date().toISOString().slice(0, 7);
    return this.costs.monthlySummary(workspaceId, target);
  }
}
