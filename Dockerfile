# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Native dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build frontend
COPY . .
RUN npx vite build

# Prune dev dependencies for smaller production image
RUN npm prune --production

# ── Stage 2: Run ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Native dependencies needed at runtime for better-sqlite3
RUN apk add --no-cache libstdc++

# Copy production node_modules (with native better-sqlite3 binary)
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy server source (will be run via tsx or compiled)
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./

# Create data directory for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/finance.db
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://localhost:3001/api/summary || exit 1

# Install tsx globally for running TypeScript server
RUN npm install -g tsx

CMD ["tsx", "server/index.ts"]
