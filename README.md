<p align="center">
  <img src="public/logo.svg" width="96" height="96" alt="Finance Tracker Logo"/>
</p>

<h1 align="center">Finance Tracker</h1>

<p align="center">A personal finance tracker built with React, TypeScript, Express, and SQLite.</p>

<p align="center">
  <a href="https://hub.docker.com/r/anri04/finance-tracker">
    <img src="https://img.shields.io/docker/v/anri04/finance-tracker?label=Docker%20Hub&logo=docker&color=0ea5e9" alt="Docker Hub"/>
  </a>
  <a href="https://github.com/Asdoos/FinanceTracker/actions/workflows/docker-publish.yml">
    <img src="https://github.com/Asdoos/FinanceTracker/actions/workflows/docker-publish.yml/badge.svg" alt="Build Status"/>
  </a>
</p>

## Features

- **Dashboard** — Monthly income vs. expenses, balance per account, category breakdown with donut chart
- **Expenses** — Full CRUD, filter by account or category, monthly/annual cost types, share % per item
- **Income** — Manage income sources per account
- **Accounts** — Multiple bank accounts with color coding, individual balance overview
- **MCP Server** — Claude Code integration: query and manage your finances via natural language

## Tech Stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- [Express.js](https://expressjs.com/) — REST API backend
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Embedded SQLite database (default)
- [PostgreSQL](https://www.postgresql.org/) — Optional external database
- [Tailwind CSS](https://tailwindcss.com/)
- [Recharts](https://recharts.org/)

## Setup

### 1. Clone & install dependencies

```bash
git clone https://github.com/Asdoos/FinanceTracker.git
cd FinanceTracker
npm install
```

### 2. Start the dev servers

```bash
npm run dev:all
```

This starts both the **Vite frontend** (port 5173) and the **Express backend** (port 3001) concurrently. The SQLite database is automatically created at `./data/finance.db` on first start.

Open [http://localhost:5173](http://localhost:5173).

> You can also start them individually: `npm run dev` (frontend) and `npm run server` (backend).

### Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `./data/finance.db` | Path to SQLite database file |
| `DATABASE_URL` | — | PostgreSQL connection string (if set, SQLite is ignored) |
| `PORT` | `3001` | Express server port |

## Docker

The image is available on [Docker Hub](https://hub.docker.com/r/anri04/finance-tracker). Data is persisted via a Docker volume.

### Pull & run

```bash
docker run -p 3001:3001 -v finance-data:/data anri04/finance-tracker
```

Open [http://localhost:3001](http://localhost:3001).

### docker-compose (SQLite)

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose up
```

### docker-compose (PostgreSQL)

```bash
cp docker-compose.postgres.yml docker-compose.yml
docker compose up
```

> **Note:** `docker-compose.yml` is gitignored. Use one of the example files as template.

### Build locally (optional)

```bash
docker build -t finance-tracker .
docker run -p 3001:3001 -v finance-data:/data finance-tracker
```

## Database

By default the app uses **SQLite** — no setup required, the database file is created automatically.

To use **PostgreSQL** instead, set the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/finance npm run dev:all
```

The app detects `DATABASE_URL` at startup and switches automatically. Tables are created on first run for both backends.

## Project Structure

```
server/               # Backend (Express REST API)
  db/
    adapter.ts        # DbAdapter interface
    sqlite.ts         # SQLite implementation (better-sqlite3)
    postgres.ts       # PostgreSQL implementation (pg)
    index.ts          # Factory — picks adapter based on DATABASE_URL
  index.ts            # Express server entry point
  mcp.ts              # MCP server (SSEServerTransport, 11 tools)
  routes/
    accounts.ts       # Account CRUD
    categories.ts     # Category CRUD
    expenses.ts       # Expense CRUD (with shareOfTotal)
    income.ts         # Income CRUD
    summary.ts        # Dashboard aggregation

src/                  # Frontend (React SPA)
  pages/
    Dashboard.tsx     # Overview with KPIs and charts
    Expenses.tsx      # Expense table with filters
    Income.tsx        # Income management
    Accounts.tsx      # Account management
  lib/
    api.ts            # REST client & useApi hook
    format.ts         # EUR and % formatters
```

## Claude Code (MCP)

The server exposes an [MCP](https://modelcontextprotocol.io) endpoint so Claude Code can read and write your finance data directly.

**Start the backend, then connect Claude Code:**

```bash
npm run server   # backend must be running on port 3001
```

The `.mcp.json` in the project root is picked up automatically when you open the project in Claude Code. Confirm the one-time security prompt — the `finance-tracker` server will then appear as connected under `/mcp`.

**Available tools:** `get_summary`, `list_expenses`, `list_income`, `list_accounts`, `list_categories`, `add_expense`, `add_income`, `update_expense`, `update_income`, `delete_expense`, `delete_income`

> See the [MCP Integration wiki page](https://github.com/Asdoos/FinanceTracker/wiki/MCP-Integration) for the full tool reference, parameter docs, and example prompts.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/accounts` | List all accounts |
| `POST` | `/api/accounts` | Create account |
| `PATCH` | `/api/accounts/:id` | Update account |
| `DELETE` | `/api/accounts/:id` | Delete account (checks references) |
| `GET` | `/api/categories` | List all categories |
| `POST` | `/api/categories` | Create category |
| `PATCH` | `/api/categories/:id` | Update category |
| `DELETE` | `/api/categories/:id` | Delete category (checks references) |
| `GET` | `/api/expenses` | List expenses (enriched with category/account) |
| `POST` | `/api/expenses` | Create expense |
| `PATCH` | `/api/expenses/:id` | Update expense |
| `DELETE` | `/api/expenses/:id` | Delete expense |
| `GET` | `/api/income` | List income sources |
| `POST` | `/api/income` | Create income |
| `PATCH` | `/api/income/:id` | Update income |
| `DELETE` | `/api/income/:id` | Delete income |
| `GET` | `/api/summary` | Dashboard aggregation |
