import { Router } from "express";
import { getDb } from "../db";

const router = Router();

// GET /api/export/transactions
router.get("/transactions", async (_req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT t.date, t.label, t.amount, t.type, t.note,
              c.name AS category, a.name AS account
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts   a ON a.id = t.account_id
       ORDER BY t.date DESC`
    );
    const header = "Datum,Bezeichnung,Betrag,Typ,Kategorie,Konto,Notiz\n";
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = (rows as any[]).map((r) =>
      [r.date, r.label, r.amount, r.type, r.category ?? "", r.account ?? "", r.note ?? ""]
        .map(escape)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="transaktionen-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send("\uFEFF" + header + lines.join("\n")); // BOM für Excel-Kompatibilität
  } catch (err) {
    next(err);
  }
});

export default router;
