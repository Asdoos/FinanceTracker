<p align="center">
  <img src="public/logo.svg" width="96" height="96" alt="Finance Tracker Logo"/>
</p>

<h1 align="center">Finance Tracker</h1>

<p align="center">A personal finance tracker built with React, TypeScript, and Convex.</p> Track monthly and annual expenses across multiple bank accounts, categorize costs, and get a real-time dashboard overview.

## Features

- **Dashboard** — Monthly income vs. expenses, balance per account, category breakdown with donut chart
- **Expenses** — Full CRUD, filter by account or category, monthly/annual cost types, share % per item
- **Income** — Manage income sources per account
- **Accounts** — Multiple bank accounts with color coding, individual balance overview

## Tech Stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- [Convex](https://www.convex.dev/) — real-time backend & database
- [Tailwind CSS](https://tailwindcss.com/)
- [Recharts](https://recharts.org/)

## Setup

### 1. Clone & install dependencies

```bash
git clone https://github.com/your-username/finance-tracker.git
cd finance-tracker
npm install
```

### 2. Set up Convex

You need a free [Convex account](https://www.convex.dev/).

```bash
npx convex dev
```

This will:
- Open a browser login
- Create a new Convex project
- Automatically write `VITE_CONVEX_URL` to `.env.local`
- Deploy the database schema

### 3. Start the dev server

In a second terminal:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Docker

The app builds to a static bundle and is served via nginx.
`VITE_CONVEX_URL` must be provided at **build time** since Vite embeds it into the bundle.

### Build & run

```bash
docker build \
  --build-arg VITE_CONVEX_URL=https://your-deployment.convex.cloud \
  -t finance-tracker .

docker run -p 8080:80 finance-tracker
```

Open [http://localhost:8080](http://localhost:8080).

### docker-compose

Copy the example file and fill in your Convex URL:

```bash
cp docker-compose.example.yml docker-compose.yml
# Edit docker-compose.yml and set VITE_CONVEX_URL
```

`docker-compose.example.yml`:

```yaml
services:
  app:
    build:
      context: .
      args:
        VITE_CONVEX_URL: https://your-deployment.convex.cloud
    ports:
      - "8080:80"
    restart: unless-stopped
```

Then start with:

```bash
docker-compose up --build
```

> **Note:** `docker-compose.yml` is gitignored — it contains your deployment URL. Only the `.example.yml` is committed.

> **Note:** The Convex backend runs on Convex's infrastructure — only the frontend is containerized.

## Project Structure

```
convex/           # Backend (Convex functions & schema)
  schema.ts       # Database schema
  accounts.ts     # Account queries & mutations
  categories.ts   # Category queries & mutations
  expenses.ts     # Expense queries & mutations
  income.ts       # Income queries & mutations
  summary.ts      # Dashboard summary query

src/
  pages/
    Dashboard.tsx  # Overview with KPIs and charts
    Expenses.tsx   # Expense table with filters
    Income.tsx     # Income management
    Accounts.tsx   # Account management
  lib/
    format.ts      # EUR and % formatters
```
