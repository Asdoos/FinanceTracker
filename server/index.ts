import http from "http";
import express from "express";
import cors from "cors";
import path from "path";
import { createRequire } from "module";
import { getDb } from "./db";
import { setupMcp } from "./mcp";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
import accountsRouter from "./routes/accounts";
import categoriesRouter from "./routes/categories";
import expensesRouter from "./routes/expenses";
import incomeRouter from "./routes/income";
import summaryRouter from "./routes/summary";

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

// ── Start server (after DB is initialized) ──────────────────────────────────
getDb().then(async () => {
  const mcpHandler = await setupMcp();

  // ── Production: serve built frontend ──────────────────────────────────
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  // Route /mcp directly to the MCP handler (bypasses Express body parsing)
  const httpServer = http.createServer((req, res) => {
    if (req.url?.startsWith("/mcp")) {
      mcpHandler(req, res);
    } else {
      (app as any)(req, res);
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`Finance Tracker v${version} — http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
