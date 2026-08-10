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

- `JWT_SECRET` — **Required.** Secret for JWT token signing (min 32 chars). Server will not start without it. Für die lokale Entwicklung setzt das `server`-Script (und damit `dev:all`) per `cross-env` ein festes Dev-Secret — es überschreibt ein extern gesetztes `JWT_SECRET`. Produktion ist nicht betroffen: der Container startet über `CMD ["tsx", "server/index.ts"]`, nicht über npm.
- `DATABASE_PATH` — path to SQLite database file (default: `./data/finance.db`)
- `DATABASE_URL` — PostgreSQL connection string; when set, SQLite is not used (e.g. `postgres://user:pass@host:5432/db`)
- `PORT` — server port (default: `3001`)
- The SQLite database and `data/` directory are created automatically on first server start

## Architecture

**Frontend** (`src/`) is a Vite + React + TypeScript SPA. Tailwind CSS for styling. All server state is fetched via REST API using a custom `useApi` hook in `src/lib/api.ts`.

**Backend** (`server/`) is an Express.js REST API. Uses a `DbAdapter` interface (`server/db/adapter.ts`) so either SQLite or PostgreSQL can be used — selected at runtime based on whether `DATABASE_URL` is set. Route handlers call `getDb()` from `server/db/index.ts` to get the singleton adapter.

### Authentication

Multi-user JWT-based authentication. First user is created via `/api/auth/setup` and becomes admin. Only admins can create additional users.

- **Auth middleware** (`server/auth/middleware.ts`): `requireAuth` validates Bearer tokens (JWT or API key), sets `req.user`. `requireAdmin` additionally checks `isAdmin`.
- **Middleware chain** in `server/index.ts`: Auth routes (`/api/auth/*`) are registered WITHOUT middleware. Then `requireAuth` is applied to all other `/api/*` routes.
- **JWT tokens**: Access token (15 min), Refresh token (30 days). Stored in `localStorage` on the frontend.
- **API keys**: For MCP server and external integrations. `ft_` prefix, SHA-256 hashed in DB. Managed via `/api/auth/api-keys`.
- **Frontend auth**: `AuthContext` (`src/context/AuthContext.tsx`) manages state. On app load: checks `/api/auth/status` → redirects to `/setup` or `/login` if needed. The API client (`src/lib/api.ts`) auto-attaches Bearer tokens and handles 401 with token refresh.
- **Data isolation**: All routes filter by `req.user!.id` — every SQL query includes `WHERE user_id = ?`.
- **Data migration**: When first admin is created via setup, all existing orphaned data (user_id IS NULL) is assigned to that admin (`server/db/migrate.ts`).

### Data model (`server/db/sqlite.ts`)

| Table | Key fields |
|---|---|
| `users` | `email` (unique), `password_hash`, `display_name`, `is_admin`, `created_at` |
| `api_keys` | `user_id` (FK), `key_hash`, `label`, `created_at` |
| `accounts` | `name`, `color`, `is_default`, `freibetrag`, `actual_balance`, `interest_rate`, `user_id` |
| `categories` | `name`, `color`, `icon`, `budget_limit`, `user_id` |
| `expense_items` | `label`, `amount`, `type` (`monthly`\|`annual`), `category_id`, `account_id`, `is_active`, `end_date`, `user_id` |
| `income_sources` | `label`, `amount`, `type` (`monthly`\|`annual`), `account_id`, `is_active`, `user_id` |
| `transactions` | `date`, `amount`, `type`, `label`, `category_id`, `account_id`, `user_id` |
| `transaction_templates` | `label`, `amount`, `type`, `category_id`, `account_id`, `user_id` |
| `goals` | `name`, `target_amount`, `current_amount`, `color`, `due_date`, `account_id`, `user_id` |

Annual amounts are divided by 12 wherever monthly totals are computed. The `GET /api/summary` endpoint is the single source of truth for the Dashboard — it returns pre-aggregated totals, per-account breakdown, per-category breakdown, and enriched expense items with `shareOfTotal`.

### API endpoints

Auth routes (no middleware):

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/status` | `{ setupComplete: boolean }` |
| POST | `/api/auth/setup` | Create first admin user + migrate orphaned data |
| POST | `/api/auth/login` | Email/password → JWT (rate-limited: 5/min per IP) |
| POST | `/api/auth/refresh` | Refresh token → new access token |
| GET | `/api/auth/me` | Current user info (requires auth) |
| GET/POST/PATCH/DELETE | `/api/auth/users[/:id]` | User CRUD (admin only) |
| GET/POST/DELETE | `/api/auth/api-keys[/:id]` | API key management |

All other routes require `Authorization: Bearer <token>` and follow REST conventions:

| Resource | Endpoints | Route file |
|---|---|---|
| `/api/accounts` | GET, POST, PATCH /:id, DELETE /:id | `accounts.ts` |
| `/api/categories` | GET, POST, PATCH /:id, DELETE /:id | `categories.ts` |
| `/api/expenses` | GET, POST, PATCH /:id, DELETE /:id | `expenses.ts` |
| `/api/income` | GET, POST, PATCH /:id, DELETE /:id | `income.ts` |
| `/api/transactions` | GET, POST, PATCH /:id, DELETE /:id | `transactions.ts` |
| `/api/templates` | GET, GET /suggestions, POST, PATCH /:id, DELETE /:id | `templates.ts` |
| `/api/goals` | GET, POST, PATCH /:id, DELETE /:id | `goals.ts` |
| `/api/summary` | GET | `summary.ts` |
| `/api/stats` | GET, GET /budget-comparison | `stats.ts` |
| `/api/export` | GET /expenses, GET /income, GET /transactions | `export.ts` |

### Frontend pages

| Route | File | Data source |
|---|---|---|
| `/setup` | `Setup.tsx` | `POST /api/auth/setup` |
| `/login` | `Login.tsx` | `POST /api/auth/login` |
| `/` | `Dashboard.tsx` | `GET /api/summary` |
| `/expenses` | `Expenses.tsx` | `GET /api/expenses` |
| `/income` | `Income.tsx` | `GET /api/income` |
| `/transactions` | `Transactions.tsx` | `GET /api/transactions` |
| `/accounts` | `Accounts.tsx` | `GET /api/accounts` + `GET /api/summary` |
| `/categories` | `Categories.tsx` | `GET /api/categories` |
| `/statistics` | `Statistics.tsx` | `GET /api/stats` |
| `/templates` | `Templates.tsx` | `GET /api/templates` |
| `/calendar` | `Calendar.tsx` | `GET /api/transactions` |
| `/goals` | `Goals.tsx` | `GET /api/goals` |
| `/users` | `UserManagement.tsx` | Auth API (admin only) |

All pages manage their own CRUD modals locally with `useState`. No shared modal/dialog component — each page contains its own.

### MCP Server

`server/mcp.ts` provides an MCP (Model Context Protocol) server with ~22 tools for reading and writing financial data. Authentication is via API key (`?apiKey=...` query param or `X-API-Key` header). Each MCP session is scoped to the API key's owner — all queries are filtered by `user_id`.

### Docker

- Multi-stage Dockerfile: `node:22-alpine` builds the Vite bundle and native modules, then copies to a lean runner image
- Express serves both the API and statically built frontend from `dist/`
- SQLite database is persisted via Docker volume at `/data/finance.db`
- GitHub Actions (`.github/workflows/docker-publish.yml`) publishes to Docker Hub as `anri04/finance-tracker` — triggered only on `v*` tags
- `docker-compose.yml` is gitignored; commit `docker-compose.example.yml` instead
- `JWT_SECRET` must be set in the environment (see `docker-compose.example.yml`)

### Important gitignore notes

- `data/` and `*.db` are gitignored — SQLite database files
- `docker-compose.yml` is gitignored; commit `docker-compose.example.yml` instead

## Release-Prozess

**Wichtig:** Den Release-Prozess (Tag + GitHub Release) nur ausführen, wenn der Nutzer explizit darum bittet. Normale Code-Änderungen werden nur committed und gepusht.

Reihenfolge bei einem neuen Release (Beispiel: `v0.5.0`):

```bash
# 1. Version in package.json aktualisieren
#    (manuell oder per Edit-Tool)

# 2. Commit
git add <geänderte Dateien> package.json
git commit -m "feat/fix: ..."

# 3. Push
git push origin master

# 4. Tag erstellen & pushen  →  löst GitHub Actions Docker-Build aus
git tag v0.5.0
git push origin v0.5.0

# 5. GitHub Release erstellen
"/c/Program Files/GitHub CLI/gh.exe" release create v0.5.0 \
  --title "v0.5.0" \
  --notes "## Was ist neu
- ...

## Docker
\`\`\`
docker pull anri04/finance-tracker:v0.5.0
\`\`\`"
```

**Hinweise:**
- `gh` ist nur über den vollen Pfad erreichbar: `/c/Program Files/GitHub CLI/gh.exe`
- Der Tag-Push triggert automatisch den Docker-Build via GitHub Actions (`v*`-Muster)
- Versionierung: Patch (`x.x.1`) für Bugfixes, Minor (`x.1.0`) für neue Features
