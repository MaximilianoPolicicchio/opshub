import { evaluateProjectHealth } from "./project-health.logic";

const now = new Date("2026-07-25T12:00:00Z");
const baseCounts = {
  highPriorityBlockedOpen: 0,
  highPriorityWaitingStale: 0,
  highPriorityOverdue: 0,
  overdueOpen: 0,
};

describe("evaluateProjectHealth", () => {
  it("is HEALTHY when there are no risk signals", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: baseCounts,
      budgetBurnPercent: 10,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("HEALTHY");
  });

  it("short-circuits to HEALTHY when PAUSED, even with risk signals", () => {
    const result = evaluateProjectHealth({
      status: "PAUSED",
      counts: { ...baseCounts, highPriorityBlockedOpen: 5 },
      budgetBurnPercent: 100,
      lastActivityAt: new Date("2020-01-01"),
      now,
    });
    expect(result.health).toBe("HEALTHY");
  });

  it("short-circuits to HEALTHY when ARCHIVED", () => {
    const result = evaluateProjectHealth({
      status: "ARCHIVED",
      counts: { ...baseCounts, overdueOpen: 10 },
      budgetBurnPercent: null,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("HEALTHY");
  });

  it("is BLOCKED when a high-priority task is blocked", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: { ...baseCounts, highPriorityBlockedOpen: 1 },
      budgetBurnPercent: null,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("BLOCKED");
  });

  it("is BLOCKED when a high-priority task has been WAITING for 7+ days", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: { ...baseCounts, highPriorityWaitingStale: 1 },
      budgetBurnPercent: null,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("BLOCKED");
  });

  it("BLOCKED takes priority over NEEDS_ATTENTION conditions", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: { highPriorityBlockedOpen: 1, highPriorityWaitingStale: 0, highPriorityOverdue: 5, overdueOpen: 10 },
      budgetBurnPercent: 99,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("BLOCKED");
  });

  it("is NEEDS_ATTENTION when a high-priority task is overdue", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: { ...baseCounts, highPriorityOverdue: 1 },
      budgetBurnPercent: null,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("NEEDS_ATTENTION");
  });

  it("is NEEDS_ATTENTION when 3+ open tasks are overdue (any priority)", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: { ...baseCounts, overdueOpen: 3 },
      budgetBurnPercent: null,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("NEEDS_ATTENTION");
  });

  it("is HEALTHY when only 2 open tasks are overdue", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: { ...baseCounts, overdueOpen: 2 },
      budgetBurnPercent: null,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("HEALTHY");
  });

  it("is NEEDS_ATTENTION when budget burn >= 90%", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: baseCounts,
      budgetBurnPercent: 90,
      lastActivityAt: now,
      now,
    });
    expect(result.health).toBe("NEEDS_ATTENTION");
  });

  it("is NEEDS_ATTENTION when ACTIVE with no activity for 14+ days", () => {
    const result = evaluateProjectHealth({
      status: "ACTIVE",
      counts: baseCounts,
      budgetBurnPercent: null,
      lastActivityAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
      now,
    });
    expect(result.health).toBe("NEEDS_ATTENTION");
  });

  it("does not apply the 14-day staleness rule to MAINTENANCE projects", () => {
    const result = evaluateProjectHealth({
      status: "MAINTENANCE",
      counts: baseCounts,
      budgetBurnPercent: null,
      lastActivityAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      now,
    });
    expect(result.health).toBe("HEALTHY");
  });
});
