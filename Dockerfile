# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app

# better-sqlite3 may need native compilation when no prebuilt binary is available.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
COPY . .

# Build-time placeholders keep server-side env validation from requiring
# production secrets. Runtime values are supplied by Docker Compose or `docker run`.
ARG ALLOWED_ORIGINS=localhost:3000
ENV NODE_ENV=production \
    APP_URL=http://localhost:3000 \
    SESSION_PASSWORD=build-only-session-password-change-me-1234567890 \
    ROOT_ADMIN_EMAIL=build@example.com \
    ROOT_ADMIN_PASSWORD=build-only-password \
    ROOT_ADMIN_NAME=Build \
    MONGODB_URI= \
    MONGODB_DB=storepoint \
    SQLITE_PATH=./data/storepoint.db \
    ALLOWED_ORIGINS=${ALLOWED_ORIGINS}

RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 sqlite3 \
  && rm -rf /var/lib/apt/lists/*

FROM runtime AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/tsconfig.scripts.json ./tsconfig.scripts.json

# Keep runtime dependencies such as tsx, but remove development-only packages.
RUN npm prune --omit=dev \
  && mkdir -p /app/data \
  && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["npm", "run", "start"]
