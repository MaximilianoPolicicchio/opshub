import {
  summariseMonth,
  isExpectedInMonth,
  parseMonth,
  monthRange,
  type SubscriptionForSummary,
  type ExpenseForSummary,
} from "./cost-summary.logic";

function sub(over: Partial<SubscriptionForSummary> = {}): SubscriptionForSummary {
  return {
    id: "sub1",
    vendorId: "v1",
    projectId: "p1",
    name: "Hosting",
    expectedAmount: "20.00",
    currency: "USD",
    frequency: "MONTHLY",
    isActive: true,
    nextChargeAt: null,
    ...over,
  };
}

function exp(over: Partial<ExpenseForSummary> = {}): ExpenseForSummary {
  return {
    id: "e1",
    vendorId: "v1",
    subscriptionId: "sub1",
    projectId: "p1",
    amount: "20.00",
    currency: "USD",
    incurredAt: new Date("2026-07-04T00:00:00Z"),
    status: "CONFIRMED",
    ...over,
  };
}

const JULY = { year: 2026, month: 7 };

describe("isExpectedInMonth", () => {
  it("expects an active monthly subscription every month", () => {
    expect(isExpectedInMonth(sub(), 2026, 7)).toBe(true);
    expect(isExpectedInMonth(sub(), 2026, 11)).toBe(true);
  });

  it("ignores inactive subscriptions", () => {
    expect(isExpectedInMonth(sub({ isActive: false }), 2026, 7)).toBe(false);
  });

  it("expects a yearly subscription only in its charge month", () => {
    const yearly = sub({ frequency: "YEARLY", nextChargeAt: new Date("2026-09-15T00:00:00Z") });
    expect(isExpectedInMonth(yearly, 2026, 9)).toBe(true);
    expect(isExpectedInMonth(yearly, 2026, 7)).toBe(false);
    // Not amortised: it does not contribute a twelfth to every other month.
    expect(isExpectedInMonth(yearly, 2027, 9)).toBe(false);
  });

  it("does not guess when a yearly subscription has no charge date", () => {
    expect(isExpectedInMonth(sub({ frequency: "YEARLY", nextChargeAt: null }), 2026, 7)).toBe(false);
  });
});

describe("summariseMonth", () => {
  it("reports expected, actual and the difference", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ expectedAmount: "20.00" })],
      expenses: [exp({ amount: "25.00" })],
    });

    expect(s.byCurrency).toEqual([
      { currency: "USD", expected: "20.00", actual: "25.00", difference: "5.00" },
    ]);
  });

  it("reports a negative difference when spend came in under the expectation", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ expectedAmount: "50.00" })],
      expenses: [exp({ amount: "30.00" })],
    });
    expect(s.byCurrency[0]!.difference).toBe("-20.00");
  });

  it("excludes pending-review expenses from totals but counts them", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [],
      expenses: [
        exp({ id: "a", amount: "10.00", status: "CONFIRMED" }),
        exp({ id: "b", amount: "999.00", status: "PENDING_REVIEW" }),
      ],
    });

    // The whole point: an unreviewed import cannot move the monthly close.
    expect(s.byCurrency[0]!.actual).toBe("10.00");
    expect(s.pendingReviewCount).toBe(1);
  });

  it("ignores rejected expenses entirely", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [],
      expenses: [exp({ amount: "40.00", status: "REJECTED" })],
    });
    expect(s.byCurrency).toEqual([]);
    expect(s.pendingReviewCount).toBe(0);
  });

  it("counts PAID as spent, like CONFIRMED", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [],
      expenses: [exp({ amount: "15.00", status: "PAID" })],
    });
    expect(s.byCurrency[0]!.actual).toBe("15.00");
  });

  it("keeps currencies separate rather than summing them", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ currency: "USD", expectedAmount: "20.00" })],
      expenses: [
        exp({ id: "a", currency: "USD", amount: "20.00" }),
        exp({ id: "b", currency: "EUR", amount: "30.00", subscriptionId: null }),
      ],
    });

    const usd = s.byCurrency.find((c) => c.currency === "USD")!;
    const eur = s.byCurrency.find((c) => c.currency === "EUR")!;
    expect(usd.actual).toBe("20.00");
    expect(eur.actual).toBe("30.00");
    expect(eur.expected).toBe("0.00");
  });

  it("groups unassigned costs under their own bucket instead of dropping them", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ projectId: null, expectedAmount: "12.00" })],
      expenses: [exp({ projectId: null, amount: "12.00" })],
    });

    const unassigned = s.byProject.find((r) => r.key === null)!;
    expect(unassigned).toBeDefined();
    expect(unassigned.actual).toBe("12.00");
  });

  it("splits totals per project", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [
        sub({ id: "s1", projectId: "p1", expectedAmount: "10.00" }),
        sub({ id: "s2", projectId: "p2", expectedAmount: "40.00" }),
      ],
      expenses: [
        exp({ id: "a", projectId: "p1", subscriptionId: "s1", amount: "10.00" }),
        exp({ id: "b", projectId: "p2", subscriptionId: "s2", amount: "45.00" }),
      ],
    });

    expect(s.byProject.find((r) => r.key === "p1")!.difference).toBe("0.00");
    expect(s.byProject.find((r) => r.key === "p2")!.difference).toBe("5.00");
  });

  it("flags a subscription that was charged more than expected", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ id: "s1", name: "Vercel Pro", expectedAmount: "20.00" })],
      expenses: [exp({ subscriptionId: "s1", amount: "25.00" })],
    });

    expect(s.priceIncreases).toHaveLength(1);
    expect(s.priceIncreases[0]).toMatchObject({
      subscriptionName: "Vercel Pro",
      expectedAmount: "20.00",
      chargedAmount: "25.00",
      increase: "5.00",
      increasePercent: "25.00",
    });
  });

  it("reports one row per subscription even when it is charged twice over", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ id: "s1", name: "Vercel Pro", expectedAmount: "20.00" })],
      expenses: [
        exp({ id: "a", subscriptionId: "s1", amount: "25.00" }),
        exp({ id: "b", subscriptionId: "s1", amount: "30.00" }),
      ],
    });

    // Two identical-looking rows for the same subscription read as a bug.
    expect(s.priceIncreases).toHaveLength(1);
    // The worst one is the informative one.
    expect(s.priceIncreases[0]!.chargedAmount).toBe("30.00");
  });

  it("does not flag a rounding-sized difference", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ id: "s1", expectedAmount: "20.00" })],
      // Within the 1% tolerance: tax rounding, not a price rise.
      expenses: [exp({ subscriptionId: "s1", amount: "20.15" })],
    });
    expect(s.priceIncreases).toEqual([]);
  });

  it("does not flag a cheaper charge", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ id: "s1", expectedAmount: "20.00" })],
      expenses: [exp({ subscriptionId: "s1", amount: "5.00" })],
    });
    expect(s.priceIncreases).toEqual([]);
  });

  it("does not compare across currencies", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ id: "s1", currency: "USD", expectedAmount: "20.00" })],
      // 25 EUR against 20 USD is not a price rise, it is a different currency.
      expenses: [exp({ subscriptionId: "s1", currency: "EUR", amount: "25.00" })],
    });
    expect(s.priceIncreases).toEqual([]);
  });

  it("reports yearly subscriptions that cannot be scheduled", () => {
    const s = summariseMonth({
      ...JULY,
      subscriptions: [sub({ id: "s9", frequency: "YEARLY", nextChargeAt: null })],
      expenses: [],
    });
    expect(s.unschedulableSubscriptionIds).toEqual(["s9"]);
  });

  it("does not lose precision on repeated small amounts", () => {
    const expenses = Array.from({ length: 3 }, (_, i) =>
      exp({ id: `e${i}`, amount: "0.10", subscriptionId: null }),
    );
    const s = summariseMonth({ ...JULY, subscriptions: [], expenses });
    // 0.1 + 0.1 + 0.1 is 0.30000000000000004 in floating point.
    expect(s.byCurrency[0]!.actual).toBe("0.30");
  });
});

describe("month helpers", () => {
  it("parses YYYY-MM", () => {
    expect(parseMonth("2026-07")).toEqual({ year: 2026, month: 7 });
  });

  it("rejects malformed months", () => {
    expect(() => parseMonth("2026-13")).toThrow();
    expect(() => parseMonth("nope")).toThrow();
  });

  it("produces a half-open range that excludes the next month", () => {
    const { start, end } = monthRange(2026, 12);
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
