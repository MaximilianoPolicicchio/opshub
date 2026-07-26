# Contributing

This is a personal project, but the setup is standard and issues or pull
requests are welcome.

## Getting set up

You need Node 20+, pnpm 9 (via Corepack), and a PostgreSQL 16 instance. Docker
is optional.

```bash
pnpm install
cp .env.example .env          # then fill in DATABASE_URL and the two JWT secrets
psql -d opshub -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
pnpm db:migrate
pnpm db:seed
```

Run the two apps in separate terminals:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

## Before opening a pull request

```bash
pnpm build && pnpm -r typecheck && pnpm -r lint && pnpm test
```

`@opshub/contracts` compiles to JavaScript and both apps import its output, so
it has to build first — `pnpm build` already does this in the right order.

The API e2e suite and the Playwright suite both need a database:

```bash
pnpm --filter @opshub/api test:e2e
```

```bash
pnpm test:ui
```

## Things worth knowing

**Every write to a tenant-owned model must filter by `workspaceId`** in its own
`where` clause, not just in a preceding ownership check.
`apps/api/src/prisma/tenant-scoping.arch.spec.ts` fails the build otherwise. If
that test flags your change, the fix is to scope the mutation, not to relax the
test.

**Business rules live in dependency-free `*.logic.ts` files** — health
evaluation, budget burn, recurrence maths, the actionable-task predicate,
overlap detection. They are unit-tested without a database. Put new rules there
and let the Prisma-backed service wrap them.

**Money is `Decimal`, never a JS number.** Durations are integer minutes.

**Do not commit real data.** Seed data is fabricated on purpose; keep it that
way.

## Commits

Conventional-commit prefixes (`feat:`, `fix:`, `ci:`, `security:`, `docs:`).
Explain *why* in the body — the diff already shows what changed. Small, focused
commits are easier to review than one large one.
