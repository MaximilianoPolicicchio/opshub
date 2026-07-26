import { computeNextDueDate, shouldStopRecurrence } from "./task-recurrence.logic";

describe("computeNextDueDate", () => {
  it("adds interval*unit to previousDueDate when anchored to DUE_DATE", () => {
    const result = computeNextDueDate({
      anchor: "DUE_DATE",
      unit: "WEEK",
      interval: 1,
      previousDueDate: new Date("2026-07-20T00:00:00Z"),
      completedAt: new Date("2026-07-19T00:00:00Z"),
      today: new Date("2026-07-19T00:00:00Z"),
    });
    expect(result.toISOString().slice(0, 10)).toBe("2026-07-27");
  });

  it("adds interval*unit to completedAt when anchored to COMPLETION_DATE", () => {
    const result = computeNextDueDate({
      anchor: "COMPLETION_DATE",
      unit: "DAY",
      interval: 3,
      previousDueDate: new Date("2026-07-20T00:00:00Z"),
      completedAt: new Date("2026-07-25T00:00:00Z"),
      today: new Date("2026-07-25T00:00:00Z"),
    });
    expect(result.toISOString().slice(0, 10)).toBe("2026-07-28");
  });

  it("rolls forward in whole intervals when the naive next date is already in the past", () => {
    // Completed very late: previous due date was 3 weeks ago, weekly recurrence.
    const result = computeNextDueDate({
      anchor: "DUE_DATE",
      unit: "WEEK",
      interval: 1,
      previousDueDate: new Date("2026-07-01T00:00:00Z"),
      completedAt: new Date("2026-07-25T00:00:00Z"),
      today: new Date("2026-07-25T00:00:00Z"),
    });
    expect(result.getTime()).toBeGreaterThanOrEqual(new Date("2026-07-25T00:00:00Z").getTime());
  });

  it("clamps month arithmetic to end of month (Jan 31 + 1 month = Feb 28)", () => {
    const result = computeNextDueDate({
      anchor: "DUE_DATE",
      unit: "MONTH",
      interval: 1,
      previousDueDate: new Date("2026-01-31T00:00:00Z"),
      completedAt: new Date("2026-01-30T00:00:00Z"),
      today: new Date("2026-01-30T00:00:00Z"),
    });
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(28); // 2026 is not a leap year
  });

  it("clamps to Feb 29 in a leap year", () => {
    const result = computeNextDueDate({
      anchor: "DUE_DATE",
      unit: "MONTH",
      interval: 1,
      previousDueDate: new Date("2028-01-31T00:00:00Z"),
      completedAt: new Date("2028-01-30T00:00:00Z"),
      today: new Date("2028-01-30T00:00:00Z"),
    });
    expect(result.getUTCMonth()).toBe(1);
    expect(result.getUTCDate()).toBe(29); // 2028 is a leap year
  });
});

describe("shouldStopRecurrence", () => {
  it("stops when nextDue is after recurrenceEndsAt", () => {
    expect(shouldStopRecurrence(new Date("2026-08-01"), new Date("2026-07-31"))).toBe(true);
  });

  it("does not stop when recurrenceEndsAt is null", () => {
    expect(shouldStopRecurrence(new Date("2026-08-01"), null)).toBe(false);
  });

  it("does not stop when nextDue is before recurrenceEndsAt", () => {
    expect(shouldStopRecurrence(new Date("2026-08-01"), new Date("2026-09-01"))).toBe(false);
  });
});
