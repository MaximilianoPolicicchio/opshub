/**
 * Given the existing dependency edges (taskId -> dependsOnTaskId) in a
 * project, would adding `taskId -> dependsOnTaskId` create a cycle? i.e. can
 * we already reach `taskId` starting from `dependsOnTaskId`?
 * Pure BFS/DFS reachability check, mirrors the recursive CTE described in
 * PROJECT_PLAN.md §2.8c.
 */
export function wouldCreateCycle(
  edges: { taskId: string; dependsOnTaskId: string }[],
  taskId: string,
  dependsOnTaskId: string,
): boolean {
  if (taskId === dependsOnTaskId) return true;

  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.taskId) ?? [];
    list.push(e.dependsOnTaskId);
    adjacency.set(e.taskId, list);
  }

  const visited = new Set<string>();
  const stack = [dependsOnTaskId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next);
    }
  }
  return false;
}
