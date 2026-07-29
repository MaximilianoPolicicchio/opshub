# syntax=docker/dockerfile:1

# Built from the repository root so the pnpm workspace and the shared
# @opshub/contracts package are both in context:
#   docker build -f apps/api/Dockerfile .

ARG NODE_VERSION=20-bookworm-slim

# ---------------------------------------------------------------- deps
# Manifests only, so a source-only change does not reinstall the world.
FROM node:${NODE_VERSION} AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM node:${NODE_VERSION} AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# openssl must be present *before* `prisma generate` runs. Without it Prisma
# misdetects the platform and emits the debian-openssl-1.1.x query engine, which
# then fails to load on bookworm (OpenSSL 3) with:
#   Unable to require(.../libquery_engine-debian-openssl-1.1.x.so.node)
# Caught by the client-instantiation check further down.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY . .

RUN pnpm --filter @opshub/api exec prisma generate
# @opshub/contracts ships compiled JS (its package main points at dist/), so it
# must be built before the API that imports it.
RUN pnpm --filter @opshub/contracts build
RUN pnpm --filter @opshub/api build

# Drop dev dependencies from the tree we are about to copy into the runtime.
RUN pnpm --filter @opshub/api --prod deploy /app-api

# `deploy` rebuilds node_modules by linking from the pnpm store, and the store
# does not hold the generated Prisma client — `prisma generate` above wrote it
# into this stage's virtual store, which is not what `deploy` copies from. Left
# alone, the runtime image starts and dies on the first query with
# "@prisma/client did not initialize yet".
#
# Reproduced outside Docker; see docs/docker-handoff.md. Regenerate against the
# deployed tree using this stage's Prisma CLI, which is a devDependency and so
# exists here but not in the runtime stage.
#
# The instantiation check fails the build rather than the container. Its dummy
# DATABASE_URL only satisfies env validation — constructing a client opens no
# connection.
RUN mkdir -p /app-api/prisma \
    && cp apps/api/prisma/schema.prisma /app-api/prisma/schema.prisma \
    && cd /app-api \
    && /repo/apps/api/node_modules/.bin/prisma generate --schema ./prisma/schema.prisma \
    && DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
       node -e "new (require('@prisma/client').PrismaClient)(); console.log('prisma client OK')"

# ---------------------------------------------------------------- migrator
# Migrations need the Prisma CLI, which is a devDependency and therefore absent
# from the pruned runtime image. This stage keeps the full build tree and does
# nothing else, so migrations stay a separate, single-run container rather than
# something every API replica races to perform on boot.
FROM build AS migrator
WORKDIR /repo/apps/api
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
CMD ["sh", "-c", "npx prisma migrate deploy --schema ./prisma/schema.prisma"]

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app

# openssl is required by Prisma's query engine on slim images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app-api ./
# `deploy` prunes dev deps but does not carry the build output or the schema
# that migrate deploy needs at container start.
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma

# node:* images ship an unprivileged `node` user; use it rather than root.
RUN chown -R node:node /app
USER node

EXPOSE 4000

# Distinct from readiness: this only asks whether the process serves HTTP.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:4000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
