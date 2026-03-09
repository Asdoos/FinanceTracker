# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start both frontend + backend dev servers
npm run dev:all

# Frontend only (Vite dev server, proxies /api to backend)
npm run dev

# Backend only (Express + SQLite, hot-reload via tsx)
npm run server

# Production build (runs tsc + vite build)
npm run build

# Lint
npm run lint
```

No test framework is configured.

## Environment

- `DATABASE_PATH` — path to SQLite database file (default: `./data/finance.db`)
- `DATABASE_URL` — PostgreSQL connection string; when set, SQLite is not used (e.g. `postgres://user:pass@host:5432/db`)
- `PORT` — server port (default: `3001`)
- The SQLite database and `data/` directory are created automatically on first server start

## Architecture

**Frontend** (`src/`) is a Vite + React + TypeScript SPA. Tailwind CSS for styling. All server state is fetched via REST API using a custom `useApi` hook in `src/lib/api.ts`.

**Backend** (`server/`) is an Express.js REST API. Uses a `DbAdapter` interface (`server/db/adapter.ts`) so either SQLite or PostgreSQL can be used — selected at runtime based on whether `DATABASE_URL` is set. Route handlers call `getDb()` from `server/db/index.ts` to get the singleton adapter.

### Data model (`server/db/sqlite.ts`)

| Table | Key fields |
|---|---|
| `accounts` | `name`, `color` (hex), `description`, `is_default` |
| `categories` | `name`, `color`, `icon` |
| `expense_items` | `label`, `amount`, `type` (`monthly`\|`annual`), `category_id`, `account_id`, `is_active`, `note` |
| `income_sources` | `label`, `amount`, `type` (`monthly`\|`annual`), `account_id`, `is_active`, `note` |

Annual amounts are divided by 12 wherever monthly totals are computed. The `GET /api/summary` endpoint is the single source of truth for the Dashboard — it returns pre-aggregated totals, per-account breakdown, per-category breakdown, and enriched expense items with `shareOfTotal`.

### API endpoints

Each domain module follows REST conventions:

| Method | Path | Description |
|---|---|---|
| GET | `/api/accounts` | List all accounts |
| POST | `/api/accounts` | Create account |
| PATCH | `/api/accounts/:id` | Update account |
| DELETE | `/api/accounts/:id` | Delete account (checks references) |
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create category |
| PATCH | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category (checks references) |
| GET | `/api/expenses` | List expenses (with category/account JOIN) |
| POST | `/api/expenses` | Create expense |
| PATCH | `/api/expenses/:id` | Update expense |
| DELETE | `/api/expenses/:id` | Delete expense |
| GET | `/api/income` | List income sources (with account JOIN) |
| POST | `/api/income` | Create income |
| PATCH | `/api/income/:id` | Update income |
| DELETE | `/api/income/:id` | Delete income |
| GET | `/api/summary` | Dashboard aggregation query |

### Frontend pages

| Route | File | Data source |
|---|---|---|
| `/` | `Dashboard.tsx` | `GET /api/summary` |
| `/expenses` | `Expenses.tsx` | `GET /api/expenses` |
| `/income` | `Income.tsx` | `GET /api/income` |
| `/accounts` | `Accounts.tsx` | `GET /api/accounts` + `GET /api/summary` |
| `/categories` | `Categories.tsx` | `GET /api/categories` |

All pages manage their own CRUD modals locally with `useState`. No shared modal/dialog component — each page contains its own.

### Docker

- Multi-stage Dockerfile: `node:22-alpine` builds the Vite bundle and native modules, then copies to a lean runner image
- Express serves both the API and statically built frontend from `dist/`
- SQLite database is persisted via Docker volume at `/data/finance.db`
- GitHub Actions (`.github/workflows/docker-publish.yml`) publishes to Docker Hub as `anri04/finance-tracker` — triggered only on `v*` tags
- `docker-compose.yml` is gitignored; commit `docker-compose.example.yml` instead

### Important gitignore notes

- `data/` and `*.db` are gitignored — SQLite database files
- `docker-compose.yml` is gitignored — use `docker-compose.example.yml` as template
