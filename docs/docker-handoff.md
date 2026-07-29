# Docker — handoff

**Status: VALIDATED END TO END.** The stack was built and run on 2026-07-29:
Postgres, migrations, API and web all came up, the demo account signed in
through the browser, and reads and writes worked against the containers.

Getting there took five real defects, all of which CI was blind to because CI
builds and tests but never runs a container. They are listed below with the
evidence, because the reasoning matters more than the fixes.

---

## Environment

Docker Desktop 4.84.0, engine 29.6.2, WSL2 backend, Windows 11.

WSL had to be installed first (`wsl --install --no-distribution` + reboot,
elevated). Docker Desktop installs fine without it, but the Linux engine never
starts — `docker info` returns a 500 on the engine pipe.

---

## Defects found and fixed

### 1. `prepare` script broke the manifest-only install layer

`packages/contracts` had `"prepare": "tsc -p tsconfig.json"`. `prepare` runs on
every `pnpm install`, but the deps stage copies **only** `package.json` files —
no `tsconfig.json`, no `src/`.

```
packages/contracts prepare$ tsc -p tsconfig.json
error TS5058: The specified path does not exist: 'tsconfig.json'
ELIFECYCLE Command failed with exit code 1
target api: failed to solve: ... exit code: 1
```

Removed. Contracts is already built explicitly by the root `build` script, by
CI, and by both Dockerfiles, so the hook was redundant as well as harmful.

### 2. Prisma client lost by `pnpm deploy`

`pnpm --prod deploy` relinks from the pnpm store, which has no generated client.
Reproduced *before* Docker was even installed:

```
$ cd /tmp/app-api-test && node -e "new (require('@prisma/client').PrismaClient)()"
@prisma/client did not initialize yet. Please run "prisma generate"
```

The build stage now regenerates against the deployed tree and asserts the client
instantiates, so this fails the build instead of the container.

### 3. Wrong Prisma query engine for the base image

Caught by the assertion added in (2) — it did its job on the very next build:

```
#33 prisma client OK
#33 PrismaClientInitializationError: Unable to require(
      .../.prisma/client/libquery_engine-debian-openssl-1.1.x.so.node)
```

`bookworm-slim` ships OpenSSL 3, but the build stage had no `openssl` installed,
so Prisma's platform detection guessed `debian-openssl-1.1.x`. Installing
`openssl` in the build stage — before `prisma generate` — fixed it.

### 4. `apps/api/.env` baked into the image

The earlier `.dockerignore` fix used `.env*`, which only matches the **context
root**. Nested env files sailed straight through. Confirmed inside a running
container:

```
$ docker compose exec api sh -c 'cut -d= -f1 /app/.env'
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
...
```

Real secrets, in a real image layer, where deleting the file later would not
remove it. Now `**/.env` and `**/.env.*`, with the `*.example` files
re-included. Verified after rebuild: `SIN .env EN LA IMAGEN`.

### 5. The web container could not reach the API

The most instructive one. `GET /api/session` returned **500**, so every
navigation bounced to sign-in even though login itself worked.

`NEXT_PUBLIC_API_URL` is `http://localhost:4000/api/v1` because that is what the
**browser** must resolve. But the Next route handler runs **inside the web
container**, where `localhost` is that container — not the API. One variable was
serving two different network positions.

Split into `API_INTERNAL_URL` (`http://api:4000/api/v1`, the compose service
name) with a fallback to the public URL for non-containerised runs.

A related one: the web image runs `NODE_ENV=production`, which marks the session
cookie `Secure`, but the stack serves plain HTTP on localhost — so the cookie was
never sent back. Compose now passes `COOKIE_SECURE=false`, and the comment says
plainly that HTTPS deployments must leave it unset.

---

## What was actually verified

| Check | Result |
| --- | --- |
| `docker compose config` | valid, exit 0, no warnings |
| `docker compose build` | exit 0 (verified without a pipe masking it) |
| Postgres health | `healthy` before anything else started |
| `migrate` service | exit **0**, both migrations applied, then exited |
| Start ordering | db healthy → migrate completed → api → web |
| API health from host | `{"status":"ok","db":"up","version":"0.1.0"}` |
| API health in container | `healthy` |
| Demo seed | ran on demand, never automatic |
| Demo login (curl) | 200 with a token |
| Demo login (browser) | Today rendered with seeded data |
| Navigation after login | `/costs` renders — session survives a full page load |
| Read | 4 seeded projects returned |
| Write | created a project; the template really did create its 4 tasks |
| Costs module | expected 90.00 / actual 77.00 / −13.00, price rise flagged 25% |
| Non-root | `whoami` → `node` |
| No env in image | `SIN .env EN LA IMAGEN` |
| Rate limiting | 429 after repeated logins, so throttling is live |

Requests were confirmed to hit the containers, not leftover local dev servers:
ports 3000 and 4000 are owned by `wslrelay` (Docker's forwarder), and the
requests appear in `docker compose logs api`.

Image sizes: `opshub-web` 437 MB, `opshub-api` 660 MB, `opshub-migrate` 2.13 GB.
The migrate image is the full build tree on purpose — it needs the Prisma CLI,
a devDependency. It is never a runtime service, so its size costs disk, not
startup.

---

## Running it

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build -d
```

Then `http://localhost:3000`, sign in with `demo@opshub.local` /
`DemoPassword123!`.

```bash
pnpm docker:seed     # demo data, on demand only
pnpm docker:logs
pnpm docker:down     # keeps the volume
pnpm docker:reset    # drops the volume too
```

The seed refuses to run against `NODE_ENV=production` without
`ALLOW_PROD_SEED=true`.

---

## Still open

- **Not tested on a clean machine.** Everything here ran against a warm build
  cache and an existing volume. A first run elsewhere should work but has not
  been proven.
- **`docker compose down` was not exercised** in this session; the stack was
  left running deliberately.
- **Compose is a local-development tool, not a deployment.** No resource limits,
  no restart tuning, no secrets management, and `SCHEDULER_ENABLED` defaults to
  true — fine for one API replica, wrong the moment there are two.
- **The migrate image is large** (2.13 GB). Trimming it means a slimmer stage
  carrying just the Prisma CLI and schema.
