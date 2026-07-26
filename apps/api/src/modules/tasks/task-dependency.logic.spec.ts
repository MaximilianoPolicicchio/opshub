import { wouldCreateCycle } from "./task-dependency.logic";

describe("wouldCreateCycle", () => {
  it("rejects a task depending on itself", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("allows a simple new dependency with no existing edges", () => {
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });

  it("detects a direct 2-cycle (b already depends on a)", () => {
    const edges = [{ taskId: "b", dependsOnTaskId: "a" }];
    expect(wouldCreateCycle(edges, "a", "b")).toBe(true);
  });

  it("detects an indirect cycle through a chain", () => {
    const edges = [
      { taskId: "b", dependsOnTaskId: "c" },
      { taskId: "c", dependsOnTaskId: "d" },
    ];
    // Adding a -> b would make d reach back to a: d -> ... -> a -> b -> c -> d
    expect(wouldCreateCycle(edges, "d", "a")).toBe(false);
    expect(wouldCreateCycle(edges, "a", "b").valueOf()).toBe(false); // a->b is fine on its own
    // Now if a already depends on d (a->d), adding d->a would cycle.
    const edgesWithBack = [...edges, { taskId: "a", dependsOnTaskId: "d" }];
    expect(wouldCreateCycle(edgesWithBack, "d", "a")).toBe(true);
  });

  it("does not flag unrelated edges as a cycle", () => {
    const edges = [{ taskId: "x", dependsOnTaskId: "y" }];
    expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
  });
});
