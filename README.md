# Finance Tracker

A personal finance tracker built with React, TypeScript, and Convex. Track monthly and annual expenses across multiple bank accounts, categorize costs, and get a real-time dashboard overview.

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
