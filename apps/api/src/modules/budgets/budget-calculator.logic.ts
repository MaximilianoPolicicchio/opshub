import Decimal from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type BillingModel = "FIXED_PRICE" | "HOURLY" | "INTERNAL";

export interface BudgetCalculatorInput {
  billingModel: BillingModel;
  budgetAmount: Decimal.Value | null;
  hourlyRate: Decimal.Value | null;
  estimatedHours: Decimal.Value | null;
  trackedMinutes: number;
  billableMinutes: number;
}

export interface BudgetCalculatorResult {
  trackedHours: Decimal;
  billableHours: Decimal;
  trackedValue: Decimal | null;
  valueBurnPercent: Decimal | null;
  hoursBurnPercent: Decimal | null;
  burnPercent: Decimal;
  remainingAmount: Decimal | null;
  remainingHours: Decimal | null;
}

const MONEY_DP = 2;
const PERCENT_DP = 2;

/**
 * Pure implementation of PROJECT_PLAN.md §2.8g. All money/percent math uses
 * decimal.js, never JS floats. Directly unit-testable without a DB.
 */
export function calculateBudgetBurn(input: BudgetCalculatorInput): BudgetCalculatorResult {
  const trackedHours = new Decimal(input.trackedMinutes).div(60);
  const billableHours = new Decimal(input.billableMinutes).div(60);
  const budgetAmount = input.budgetAmount !== null ? new Decimal(input.budgetAmount) : null;
  const hourlyRate = input.hourlyRate !== null ? new Decimal(input.hourlyRate) : null;
  const estimatedHours = input.estimatedHours !== null ? new Decimal(input.estimatedHours) : null;

  let trackedValue: Decimal | null = null;
  if (input.billingModel === "HOURLY") {
    if (hourlyRate !== null) trackedValue = billableHours.mul(hourlyRate);
  } else if (input.billingModel === "FIXED_PRICE") {
    if (budgetAmount !== null && estimatedHours !== null && estimatedHours.gt(0)) {
      trackedValue = billableHours.mul(budgetAmount.div(estimatedHours));
    } else {
      trackedValue = null; // falls back to hours-based burn, per §7 risk #9
    }
  } else if (input.billingModel === "INTERNAL") {
    trackedValue = trackedHours.mul(hourlyRate ?? new Decimal(0));
  }

  const valueBurnPercent =
    trackedValue !== null && budgetAmount !== null && budgetAmount.gt(0)
      ? trackedValue.div(budgetAmount).mul(100).toDecimalPlaces(PERCENT_DP)
      : null;
  const hoursBurnPercent =
    estimatedHours !== null && estimatedHours.gt(0)
      ? trackedHours.div(estimatedHours).mul(100).toDecimalPlaces(PERCENT_DP)
      : null;

  const burnPercent = valueBurnPercent ?? hoursBurnPercent ?? new Decimal(0);

  const remainingAmount =
    budgetAmount !== null && trackedValue !== null ? budgetAmount.sub(trackedValue).toDecimalPlaces(MONEY_DP) : null;
  const remainingHours = estimatedHours !== null ? estimatedHours.sub(trackedHours).toDecimalPlaces(2) : null;

  return {
    trackedHours: trackedHours.toDecimalPlaces(2),
    billableHours: billableHours.toDecimalPlaces(2),
    trackedValue: trackedValue !== null ? trackedValue.toDecimalPlaces(MONEY_DP) : null,
    valueBurnPercent,
    hoursBurnPercent,
    burnPercent,
    remainingAmount,
    remainingHours,
  };
}
