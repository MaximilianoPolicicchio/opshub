import { calculateBudgetBurn } from "./budget-calculator.logic";

describe("calculateBudgetBurn", () => {
  it("computes HOURLY burn from billable hours * rate", () => {
    const result = calculateBudgetBurn({
      billingModel: "HOURLY",
      budgetAmount: 6000,
      hourlyRate: 55,
      estimatedHours: 110,
      trackedMinutes: 68 * 60,
      billableMinutes: 60 * 60,
    });
    expect(result.trackedValue!.toNumber()).toBeCloseTo(3300, 2);
    expect(result.burnPercent.toNumber()).toBeCloseTo(55, 1);
  });

  it("falls back to hours-based burn for FIXED_PRICE with no estimatedHours", () => {
    const result = calculateBudgetBurn({
      billingModel: "FIXED_PRICE",
      budgetAmount: 4500,
      hourlyRate: null,
      estimatedHours: null,
      trackedMinutes: 60 * 60,
      billableMinutes: 50 * 60,
    });
    expect(result.trackedValue).toBeNull();
    expect(result.valueBurnPercent).toBeNull();
    expect(result.hoursBurnPercent).toBeNull();
    expect(result.burnPercent.toNumber()).toBe(0);
  });

  it("computes FIXED_PRICE implicit rate burn when estimatedHours is set", () => {
    const result = calculateBudgetBurn({
      billingModel: "FIXED_PRICE",
      budgetAmount: 4500,
      hourlyRate: null,
      estimatedHours: 90,
      trackedMinutes: 70 * 60,
      billableMinutes: 70 * 60,
    });
    // implicit rate = 4500/90 = 50/h; trackedValue = 70 * 50 = 3500
    expect(result.trackedValue!.toNumber()).toBeCloseTo(3500, 2);
    expect(result.valueBurnPercent!.toNumber()).toBeCloseTo(77.78, 1);
  });

  it("computes INTERNAL as a cost view with no budgetAmount", () => {
    const result = calculateBudgetBurn({
      billingModel: "INTERNAL",
      budgetAmount: null,
      hourlyRate: 0,
      estimatedHours: 200,
      trackedMinutes: 60 * 60,
      billableMinutes: 0,
    });
    expect(result.valueBurnPercent).toBeNull();
    expect(result.hoursBurnPercent!.toNumber()).toBeCloseTo(30, 1);
    expect(result.burnPercent.toNumber()).toBeCloseTo(30, 1);
  });

  it("allows remainingAmount to go negative when over budget", () => {
    const result = calculateBudgetBurn({
      billingModel: "HOURLY",
      budgetAmount: 1000,
      hourlyRate: 100,
      estimatedHours: 10,
      trackedMinutes: 15 * 60,
      billableMinutes: 15 * 60,
    });
    expect(result.remainingAmount!.toNumber()).toBeLessThan(0);
  });

  it("rounds money and percentages to 2 decimal places", () => {
    const result = calculateBudgetBurn({
      billingModel: "HOURLY",
      budgetAmount: 1000,
      hourlyRate: 33.333,
      estimatedHours: 10,
      trackedMinutes: 61,
      billableMinutes: 61,
    });
    expect(result.trackedValue!.decimalPlaces()).toBeLessThanOrEqual(2);
    expect(result.burnPercent.decimalPlaces()).toBeLessThanOrEqual(2);
  });
});
