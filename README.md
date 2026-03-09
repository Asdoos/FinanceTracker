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

## Tech Stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- [Express.js](https://expressjs.com/) — REST API backend
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Embedded SQLite database
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
| `PORT` | `3001` | Express server port |

## Docker

The image is available on [Docker Hub](https://hub.docker.com/r/anri04/finance-tracker). Data is persisted via a Docker volume.

### Pull & run

```bash
docker run -p 3001:3001 -v finance-data:/data anri04/finance-tracker
```

Open [http://localhost:3001](http://localhost:3001).

### docker-compose

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose up
```

`docker-compose.example.yml`:

```yaml
services:
  finance-tracker:
    image: anri04/finance-tracker:latest
    ports:
      - "3001:3001"
    volumes:
      - finance-data:/data
    environment:
      - DATABASE_PATH=/data/finance.db
    restart: unless-stopped

volumes:
  finance-data:
```

> **Note:** `docker-compose.yml` is gitignored. Only the `.example.yml` is committed.

### Build locally (optional)

```bash
docker build -t finance-tracker .
docker run -p 3001:3001 -v finance-data:/data finance-tracker
```

## Project Structure

```
server/               # Backend (Express REST API)
  db.ts               # SQLite connection & schema migration
  index.ts            # Express server entry point
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
