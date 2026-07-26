# syntax=docker/dockerfile:1

# Built from the repository root:
#   docker build -f apps/web/Dockerfile .

ARG NODE_VERSION=20-bookworm-slim

# ---------------------------------------------------------------- deps
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

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, so the API URL has to be
# known here rather than at container start.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Opt into standalone output here rather than in next.config.js: producing it
# needs symlinks, which fail on Windows hosts during ordinary local builds.
ENV NEXT_OUTPUT_STANDALONE=true

# @opshub/contracts ships compiled JS, so it must be built before its consumers.
RUN pnpm --filter @opshub/contracts build
RUN pnpm --filter @opshub/web build

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# `output: "standalone"` emits a self-contained server plus only the node
# modules it actually reaches, so no pnpm install happens in this stage.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# No apps/web/public directory exists yet; add a COPY for it if one is created.

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/login || exit 1

CMD ["node", "apps/web/server.js"]
