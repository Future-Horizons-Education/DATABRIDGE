# DATABRIDGE Connector API — multi-stage build
# Stage 1: build the full pnpm workspace
FROM node:20-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Copy lockfile + workspace manifests first for better layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages packages
COPY profiles profiles
COPY apps/api apps/api

RUN pnpm install --frozen-lockfile --filter "@databridge/api..."
RUN pnpm --filter "@databridge/api..." build

# Stage 2: lean runtime
FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

ENV NODE_ENV=production
ENV API_PORT=3001
ENV API_HOST=0.0.0.0

COPY --from=builder /repo/apps/api/dist        ./dist
COPY --from=builder /repo/apps/api/package.json ./package.json
COPY --from=builder /repo/node_modules         ./node_modules
COPY --from=builder /repo/packages             ./packages
COPY --from=builder /repo/profiles             ./profiles

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${API_PORT}/healthz || exit 1

USER node
CMD ["node", "dist/server.js"]
