# Docker — handoff

**Status: NOT VALIDATED END TO END.** Docker is not installed on the machine
this work was done on, so no image was built and no container was ever started.

What *was* done: a static audit that reproduced two real defects locally without
Docker, and fixed them. The setup is closer to working than it was, but until
someone runs `docker compose up --build` it remains unproven. Nothing in this
repository claims otherwise.

---

## The blocker, exactly

```
$ docker --version
bash: docker: command not found

PS> Get-Command docker          ->  not on PATH
PS> Test-Path "C:\Program Files\Docker\Docker\resources\bin\docker.exe"  ->  False
PS> Test-Path "C:\Program Files\Docker\Docker\Docker Desktop.exe"        ->  False
PS> Test-Path "$env:ProgramData\DockerDesktop"                           ->  False
PS> Get-Service com.docker.service                                       ->  not installed
```

No binary, no service, no install directory. Docker Desktop is genuinely absent,
not merely off the PATH. Installing it is a system-level change requiring admin
rights and a reboot, so it was not done unilaterally.

---

## What was verified anyway, and how

Docker was not needed to test the parts most likely to break, because the risk
was in **pnpm's behaviour**, not in Docker's. Both defects below were reproduced
against the real workspace.

### Defect 1 — the API image would have crash-looped (FIXED)

`apps/api/Dockerfile` used `pnpm --filter @opshub/api --prod deploy /app-api` to
prune dev dependencies for the runtime stage. `deploy` rebuilds `node_modules`
by linking from the pnpm store, which **does not contain the generated Prisma
client** — `prisma generate` had written it into the build tree's virtual store,
and that copy is not carried across.

Reproduced locally:

```bash
$ pnpm --filter @opshub/api --prod deploy /tmp/app-api-test
# ... @prisma/client postinstall warns: "In order to use @prisma/client,
#     please install Prisma CLI"

$ cd /tmp/app-api-test && node -e "new (require('@prisma/client').PrismaClient)()"
FALLO: @prisma/client did not initialize yet. Please run "prisma generate"
       and try to import it again.
```

So the container would have started and died immediately on the first query.
CI never caught this because CI builds and tests, but never runs the pruned
production tree.

**Fix, verified locally:** regenerate the client *into the deployed tree* after
`deploy`, using the build stage's Prisma CLI (a devDependency, so it exists in
that stage but not in the runtime one):

```bash
$ cd /tmp/app-api-test && <build-tree>/node_modules/.bin/prisma generate --schema ./prisma/schema.prisma
$ node -e "..."
OK: cliente generado, vendor= object expense= object
```

### Defect 2 — `.env.docker` would have been baked into the image (FIXED)

`.dockerignore` excluded `.env`, `.env.local` and `.env.*.local`, but **not**
`.env.docker` — which is precisely the file the README instructs you to create
and fill with secrets. `COPY . .` in the build stage would have copied it into
an image layer, where it survives even if a later layer deletes it.

Fixed by excluding `.env*` wholesale and re-including only `*.example`.

### Also checked statically

- `compose.yaml` parses as valid YAML; services are `db`, `migrate`, `api`,
  `web`. **`docker compose config` has not been run** — it validates more than
  YAML syntax (interpolation, schema) and remains unrun.
- Image tags are pinned: `postgres:16`, `node:20-bookworm-slim`. No `latest`.
- Migrations run as a one-shot `migrate` service that the API waits on via
  `service_completed_successfully`, so replicas cannot race to apply them.
- `btree_gist` is created twice on purpose — an initdb script (fresh volumes
  only) and the migrate service (existing volumes). Without it the TimeEntry
  exclusion constraint cannot be created.
- Both runtime stages run as the unprivileged `node` user.
- `apps/api/dist/main.js` is the correct entrypoint (verified by running the
  compiled server outside Docker in earlier work).

---

## Files changed

| File | Change |
| --- | --- |
| `apps/api/Dockerfile` | regenerate the Prisma client into the deployed tree after `pnpm deploy` |
| `.dockerignore` | exclude every `.env*` except `*.example` |
| `docs/docker-handoff.md` | this file |
| `README.md`, `docs/deployment.md` | keep the "unverified" wording accurate |

No migrations. No changes to application code.

---

## Still unverified — the honest list

Everything that needs a running daemon:

- `docker compose config`
- image builds actually succeeding (the pnpm symlink layout survives
  `COPY --from`, Next standalone output resolves under pnpm, `corepack enable`
  picks up `packageManager`)
- Postgres reaching a healthy state and the healthcheck gating correctly
- the `migrate` service running exactly once and exiting 0
- the API answering `/api/v1/health` inside the network
- the web container reaching the API, and demo login working
- final image sizes and layer caching

Defect 1 was one of several plausible build-time failures. Fixing it does not
mean the build now succeeds — it means one known reason for failure is gone.

---

## Next steps, in order

1. Install Docker Desktop (admin rights + reboot), or run these on any machine
   that already has it.
2. `cp .env.docker.example .env.docker` — it is gitignored; put throwaway values
   in it, never real secrets.
3. `docker compose config` — fix whatever it reports before building.
4. `docker compose up --build -d`, then `docker compose ps`.
5. `docker compose logs migrate` — it must exit 0 having applied migrations.
6. `curl localhost:4000/api/v1/health`, then open `localhost:3000` and sign in
   with the demo account.
7. Optional demo data: `pnpm docker:seed`. It is never automatic, and the seed
   refuses to run against `NODE_ENV=production` without `ALLOW_PROD_SEED=true`.
8. `docker compose down` (keep the volume unless you want a clean database).
9. Record the real output here, and only then remove the "unverified" wording
   from the README, `docs/deployment.md` and this file.
