import { isTaskActionable, classifyActionableReason, capNextPriorityBackfill, compareActionableTasks } from "./actionable-task.logic";

const today = new Date("2026-07-25T00:00:00Z");
const endOfToday = new Date("2026-07-25T23:59:59.999Z");
const activeProject = { status: "ACTIVE" as const, archivedAt: null };

function task(overrides: Partial<Parameters<typeof isTaskActionable>[0]> = {}) {
  return {
    archivedAt: null,
    status: "BACKLOG" as const,
    isBlockedLive: false,
    dueDate: null,
    surfacedForDate: null,
    priority: "MEDIUM" as const,
    ...overrides,
  };
}

describe("isTaskActionable", () => {
  it("excludes archived tasks", () => {
    expect(isTaskActionable(task({ archivedAt: new Date(), status: "IN_PROGRESS" }), activeProject, today, endOfToday)).toBe(false);
  });

  it("excludes DONE tasks", () => {
    expect(isTaskActionable(task({ status: "DONE" }), activeProject, today, endOfToday)).toBe(false);
  });

  it("excludes blocked tasks even if overdue", () => {
    expect(
      isTaskActionable(task({ isBlockedLive: true, dueDate: new Date("2026-07-20") }), activeProject, today, endOfToday),
    ).toBe(false);
  });

  it("excludes tasks in PAUSED projects", () => {
    expect(
      isTaskActionable(task({ status: "IN_PROGRESS" }), { status: "PAUSED", archivedAt: null }, today, endOfToday),
    ).toBe(false);
  });

  it("includes overdue tasks", () => {
    expect(isTaskActionable(task({ dueDate: new Date("2026-07-20") }), activeProject, today, endOfToday)).toBe(true);
  });

  it("includes tasks due today", () => {
    expect(isTaskActionable(task({ dueDate: new Date("2026-07-25T10:00:00Z") }), activeProject, today, endOfToday)).toBe(true);
  });

  it("includes IN_PROGRESS tasks regardless of due date", () => {
    expect(isTaskActionable(task({ status: "IN_PROGRESS" }), activeProject, today, endOfToday)).toBe(true);
  });

  it("includes tasks surfaced for today", () => {
    expect(isTaskActionable(task({ surfacedForDate: new Date("2026-07-25") }), activeProject, today, endOfToday)).toBe(true);
  });

  it("includes NEXT + HIGH/CRITICAL priority tasks as backfill", () => {
    expect(isTaskActionable(task({ status: "NEXT", priority: "HIGH" }), activeProject, today, endOfToday)).toBe(true);
    expect(isTaskActionable(task({ status: "NEXT", priority: "MEDIUM" }), activeProject, today, endOfToday)).toBe(false);
  });

  it("excludes WAITING tasks from the actionable predicate (handled separately by callers)", () => {
    // WAITING with a due date still evaluates true here; the service layer
    // is responsible for routing WAITING tasks to their own section instead.
    expect(isTaskActionable(task({ status: "WAITING", dueDate: new Date("2026-07-20") }), activeProject, today, endOfToday)).toBe(true);
  });
});

describe("classifyActionableReason", () => {
  it("prefers due_or_overdue over next_backfill when both apply", () => {
    const reason = classifyActionableReason(
      task({ status: "NEXT", priority: "HIGH", dueDate: new Date("2026-07-20") }),
      today,
      endOfToday,
    );
    expect(reason).toBe("due_or_overdue");
  });

  it("classifies a pure NEXT+HIGH task as next_backfill", () => {
    const reason = classifyActionableReason(task({ status: "NEXT", priority: "CRITICAL" }), today, endOfToday);
    expect(reason).toBe("next_backfill");
  });
});

describe("capNextPriorityBackfill", () => {
  it("caps only next_backfill-reason tasks at 5, leaving others untouched", () => {
    const items = [
      ...Array(3).fill({ reason: "due_or_overdue" as const }),
      ...Array(8).fill({ reason: "next_backfill" as const }),
    ];
    const result = capNextPriorityBackfill(items, 5);
    expect(result.length).toBe(3 + 5);
  });
});

describe("compareActionableTasks", () => {
  it("orders overdue before non-overdue", () => {
    const overdue = { id: "a", dueDate: new Date("2026-07-01"), priority: "LOW" as const, sortOrder: 0, status: "NEXT" as const };
    const notOverdue = { id: "b", dueDate: null, priority: "CRITICAL" as const, sortOrder: 0, status: "NEXT" as const };
    expect(compareActionableTasks(overdue, notOverdue, endOfToday)).toBeLessThan(0);
  });

  it("orders by priority when overdue status ties", () => {
    const critical = { id: "a", dueDate: null, priority: "CRITICAL" as const, sortOrder: 0, status: "NEXT" as const };
    const low = { id: "b", dueDate: null, priority: "LOW" as const, sortOrder: 0, status: "NEXT" as const };
    expect(compareActionableTasks(critical, low, endOfToday)).toBeLessThan(0);
  });
});
