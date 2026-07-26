# ADR 0001 — Explicit tenant scoping instead of a Prisma client extension

**Status:** accepted · **Date:** 2026-07-26

## Context

Every tenant-owned row carries a denormalized `workspaceId`. The original design
called for a Prisma client extension, `PrismaService.forWorkspace(workspaceId)`,
that injected `where.workspaceId` on tenant models — described in the README as
defence applied "automatically".

It was never adopted. `forWorkspace` appeared exactly twice in the repository:
its own definition and a type alias. Isolation was in fact carried entirely by
each service filtering by hand.

That is the worst of both worlds. The protection was real but undocumented, and
the documented protection was fictional. A reader — or an auditor, or an
interviewer — would have believed there was a backstop that did not exist.

Separately, writes used a check-then-act shape:

```ts
const existing = await prisma.note.findFirst({ where: { id, workspaceId } });
if (!existing) throw new NotFoundException();
return prisma.note.update({ where: { id }, data });   // <- unscoped
```

Correct today, but the authorisation and the mutation are two statements. Move
the check, extract a helper, add an early return, and the write silently crosses
a tenant boundary. 29 sites had this shape.

## Decision

Delete the extension. Make isolation explicit and uniform, and enforce it with a
test rather than with a convention.

1. Reads use `findFirst({ id, workspaceId })`, never `findUnique({ id })`, so a
   foreign id yields 404 rather than 403 and does not disclose existence.
2. Every `update` and `delete` carries `workspaceId` in its own `where`. Prisma 5
   permits extra non-unique filters alongside a unique field, so
   `{ id, workspaceId }` remains a valid `WhereUniqueInput` while making the
   mutation authoritative on its own. A cross-tenant id raises `P2025`.
3. [`tenant-scoping.arch.spec.ts`](../../apps/api/src/prisma/tenant-scoping.arch.spec.ts)
   scans the module sources and fails the build if any mutation on a
   tenant-owned model omits `workspaceId`.

## Alternatives considered

**Wire the extension up properly.** Making it genuinely transparent needs an
`AsyncLocalStorage` request context plus an extended client that every service
must remember to use. That is the same "remember to do the right thing" failure
mode as explicit filtering, only hidden — and a service that forgets gets no
warning at all. Rejected as more machinery for less auditability.

**Postgres row-level security.** Strictly stronger: it survives a service that
bypasses the helpers entirely, and it is the only option that also covers a raw
SQL console. Deferred because it requires per-request session variables and a
separate application role, and because it would have been a much larger change
to make while the documented and actual behaviour still disagreed. This is the
intended next step, not a rejected option.

## Consequences

- Isolation now matches its documentation, which was the point.
- The TOCTOU window is closed: the mutation itself is scoped.
- Adding a tenant model means adding it to the list in the architectural test.
  Forgetting is not silent, because a mutation without `workspaceId` fails the
  build.
- The guarantee is defence in application code, not in the database. Anything
  reaching Postgres by another path is uncovered.
- Verified by reintroducing violations in both call shapes (Prettier-wrapped and
  inline) and confirming the test reported file and line, plus five e2e cases
  asserting cross-tenant writes 404 and leave the target row unchanged.

## Revisit when

A second human user exists, a background worker writes outside the request
lifecycle, or anything gains direct SQL access. Any of those makes RLS worth its
cost.
