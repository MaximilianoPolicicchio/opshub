# Deployment

There is no production deployment. This is the procedure to create one, written
so it can be followed rather than improvised.

> **Docker status:** the compose stack has never been run. See
> [docker-handoff.md](docker-handoff.md) for what was verified statically, the
> two defects that were fixed, and the exact commands still to run.

## Requirements

- Node 20, pnpm 9 (via Corepack)
- PostgreSQL 16 whose user can `CREATE EXTENSION` — **`btree_gist` is mandatory**;
  the time-entry overlap constraint cannot be created without it, and
  `migrate deploy` fails with an opaque operator-class error. Verify before
  choosing a managed provider.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | |
| `JWT_ACCESS_SECRET` | yes | ≥ 32 chars; the API refuses to boot otherwise |
| `JWT_REFRESH_SECRET` | yes | ≥ 32 chars, different from the access secret |
| `ACCESS_TOKEN_TTL` | no | default `15m` |
| `REFRESH_TOKEN_TTL` | no | default `30d` |
| `WEB_ORIGIN` | yes | CORS origin |
| `API_PORT` | no | default `4000` |
| `SCHEDULER_ENABLED` | no | default true — **set false on all but one instance** |
| `THROTTLE_ENABLED` | no | default true; never disable in production |
| `COOKIE_SECURE` | no | defaults to on in production; only set false for local HTTP |
| `N8N_WEBHOOK_URL` / `_SECRET` | no | absent means simulated runs |
| `NEXT_PUBLIC_API_URL` | yes (web) | **build-time**, inlined into the bundle |

Generate secrets with `openssl rand -base64 48`. Never reuse the values in
`.env.example` or `.env.docker.example` — they are placeholders and are public.

## Order of operations

```bash
pnpm install --frozen-lockfile
pnpm --filter @opshub/contracts build      # both apps import its compiled output
pnpm --filter @opshub/api exec prisma generate
pnpm --filter @opshub/api build
pnpm --filter @opshub/web build            # needs NEXT_PUBLIC_API_URL set
```

Then, as a separate step before starting the API:

```bash
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
pnpm --filter @opshub/api exec prisma migrate deploy
```

Run migrations as their own job, not in the API entrypoint — otherwise multiple
replicas race to apply them. `compose.yaml` models this with a one-shot `migrate`
service.

Start: `node apps/api/dist/main.js` and `next start` for the web app.

## Do not seed production

The seed refuses to run when `NODE_ENV=production` unless `ALLOW_PROD_SEED=true`.
That guard exists to be obeyed. Demo data is fabricated and belongs nowhere near
a real deployment.

## Health checks

- `GET /api/v1/health` returns `{ status, db, version }` and verifies the
  database connection. Use it for readiness.
- Separate `/health/live` and `/health/ready` endpoints are **not** implemented
  yet; today the single endpoint serves both roles, which means a database blip
  will fail liveness and restart the process. Splitting them is tracked work.

## Rollback

Application rollback is redeploying the previous image or commit — the API is
stateless.

**Database rollback is not automatic.** Prisma migrations are forward-only and
there are no down migrations. The safe procedure is:

1. Take a snapshot before every `migrate deploy`.
2. Prefer expand-then-contract: add columns, deploy, backfill, and only drop in a
   later release. That keeps the previous application version compatible with the
   new schema, so an app rollback does not require a database rollback.
3. If a destructive migration must be reverted, restore the snapshot. Accept the
   data loss window; do not hand-edit schema on a live database.

## Suggested target

Railway or Fly for the API, Vercel for the web app, a managed Postgres 16 that
permits extensions. The web app must be built with `NEXT_PUBLIC_API_URL` pointing
at the public API URL, because that value is inlined at build time and cannot be
changed by an environment variable at runtime.

Set `SCHEDULER_ENABLED=true` on exactly one API instance. The cron is in-process
and has no distributed lock, so two enabled replicas will duplicate overdue scans
and weekly reviews.
