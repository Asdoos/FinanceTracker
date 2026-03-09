# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (requires VITE_CONVEX_URL in .env.local)
npm run dev

# Convex backend dev (run in a separate terminal — auto-populates .env.local)
npx convex dev

# Production build (runs tsc + vite build)
npm run build

# Docker build skips tsc to avoid stub false-positives — use this in CI/Dockerfile
npx vite build

# Lint
npm run lint
```

No test framework is configured.

## Environment

- `.env.local` must contain `VITE_CONVEX_URL` (written automatically by `npx convex dev`)
- Without it, `main.tsx` renders a German-language error screen instead of the app
- Docker runtime injection: `entrypoint.sh` replaces the literal string `__CONVEX_URL_PLACEHOLDER__` in the built JS bundle with the `CONVEX_URL` env var at container start

## Architecture

**Frontend** (`src/`) is a Vite + React + TypeScript SPA. Tailwind CSS for styling. No state management library — all server state is handled by Convex's reactive `useQuery`/`useMutation` hooks.

**Backend** (`convex/`) is fully managed by [Convex](https://convex.dev). Functions run on Convex's cloud; only the frontend is containerized. Convex auto-generates `convex/_generated/` — those stubs are committed so CI/Docker builds work without running `npx convex dev`.

### Data model (`convex/schema.ts`)

| Table | Key fields |
|---|---|
| `accounts` | `name`, `color` (hex), `isDefault` |
| `categories` | `name`, `color` |
| `expense_items` | `label`, `amount`, `type` (`monthly`\|`annual`), `categoryId`, `accountId`, `isActive` |
| `income_sources` | `label`, `amount`, `type` (`monthly`\|`annual`), `accountId`, `isActive` |

Annual amounts are divided by 12 wherever monthly totals are computed. The `summary.get` query is the single source of truth for the Dashboard — it returns pre-aggregated totals, per-account breakdown, per-category breakdown, and enriched expense items with `shareOfTotal`.

### Convex functions

Each domain module follows the same pattern: `list` (query), `add`/`update`/`remove` (mutations). The `summary` module is a read-only aggregation query used only by the Dashboard.

### Frontend pages

| Route | File | Data source |
|---|---|---|
| `/` | `Dashboard.tsx` | `api.summary.get` |
| `/expenses` | `Expenses.tsx` | `api.expenses.list` |
| `/income` | `Income.tsx` | `api.income.list` |
| `/accounts` | `Accounts.tsx` | `api.accounts.list` |

All pages manage their own CRUD modals locally with `useState`. No shared modal/dialog component — each page contains its own.

### Docker & CI

- Multi-stage Dockerfile: `node:22-alpine` builds the Vite bundle, `nginx:alpine` serves it
- `nginx.conf` has SPA fallback (`try_files $uri /index.html`) and aggressive asset caching
- GitHub Actions (`.github/workflows/docker-publish.yml`) publishes to Docker Hub as `anri04/finance-tracker` — triggered only on `v*` tags
- `docker-compose.yml` is gitignored (contains personal deployment URL); commit `docker-compose.example.yml` instead

### Important gitignore notes

- `convex/_generated/` is **not** gitignored — stubs must be committed for CI
- `convex/seed.ts` is gitignored — contains personal financial data
- `docker-compose.yml` is gitignored — use `docker-compose.example.yml` as template
