import express from "express";
import cors from "cors";
import path from "path";
import accountsRouter from "./routes/accounts";
import categoriesRouter from "./routes/categories";
import expensesRouter from "./routes/expenses";
import incomeRouter from "./routes/income";
import summaryRouter from "./routes/summary";

// Import db to trigger schema migration on startup
import "./db";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(cors());
app.use(express.json());

// ── API routes ──────────────────────────────────────────────────────────────
app.use("/api/accounts", accountsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/income", incomeRouter);
app.use("/api/summary", summaryRouter);

// ── Production: serve built frontend ────────────────────────────────────────
const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
