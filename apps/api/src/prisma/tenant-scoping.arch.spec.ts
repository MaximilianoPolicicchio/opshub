import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Architectural guard for multi-tenant isolation.
 *
 * Every tenant-owned model carries a denormalized `workspaceId`. Reads are
 * scoped because each service filters explicitly, but writes are the dangerous
 * case: `update({ where: { id } })` preceded by a separate ownership check is
 * a TOCTOU pattern — the check and the write are two statements, and the write
 * itself would happily cross a tenant boundary if the check were ever dropped,
 * reordered, or refactored away.
 *
 * Prisma 5 allows extra non-unique filters alongside a unique field in `where`,
 * so `{ id, workspaceId }` stays a valid WhereUniqueInput while making the
 * mutation authoritative on its own. A cross-tenant id then throws P2025
 * instead of silently succeeding.
 *
 * This test enforces that rule mechanically, because code review does not
 * reliably catch a missing property in a where clause.
 */

const TENANT_MODELS = [
  "project",
  "projectTemplate",
  "milestone",
  "task",
  "taskDependency",
  "taskLink",
  "note",
  "timeEntry",
  "projectBudget",
  "budgetAlert",
  "automation",
  "automationRun",
  "activityEvent",
  "vendor",
  "subscription",
  "expense",
];

const MUTATIONS = ["update", "delete", "updateMany", "deleteMany"];

const CALL = new RegExp(
  `\\.(${TENANT_MODELS.join("|")})\\.(${MUTATIONS.join("|")})\\(`,
);
// A `where: { ... }` whose body has no nested braces, on a single line.
const WHERE = /where:\s*\{\s*([^{}]*?)\s*\}/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") && !full.endsWith(".spec.ts") ? [full] : [];
  });
}

describe("tenant scoping (architectural)", () => {
  it("every write to a tenant-owned model filters by workspaceId", () => {
    const modulesDir = join(__dirname, "..", "modules");
    const violations: string[] = [];

    for (const file of sourceFiles(modulesDir)) {
      const lines = readFileSync(file, "utf-8").split("\n");

      lines.forEach((line, i) => {
        // The model + mutation may sit on this line or the one just above it,
        // depending on how Prettier wrapped the call.
        const onThisLine = CALL.test(line);
        const onPrevLine = i > 0 && CALL.test(lines[i - 1]!);
        if (!onThisLine && !onPrevLine) return;
        if (!line.includes("where:")) return;

        for (const match of line.matchAll(WHERE)) {
          const body = match[1] ?? "";
          if (body && !body.includes("workspaceId")) {
            const rel = file.split("src")[1]?.replace(/\\/g, "/") ?? file;
            violations.push(`src${rel}:${i + 1}  where{ ${body} }`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
