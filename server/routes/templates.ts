import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";

const router = Router();

const TemplateCreateSchema = z.object({
  label: z.string().min(1),
  amount: z.number().positive(),
  // eslint-disable-next-line no-restricted-syntax -- Vorlagen kennen keinen Transfer-Typ (out of scope der Map)
  type: z.enum(["income", "expense"]),
  categoryId: z.number().int().nullable().optional(),
  accountId: z.number().int(),
  note: z.string().nullable().optional(),
});
const TemplatePatchSchema = TemplateCreateSchema.partial();

function mapRow(r: any) {
  return {
    id: r.id,
    label: r.label,
    amount: r.amount,
    type: r.type,
    categoryId: r.category_id,
    accountId: r.account_id,
    note: r.note || null,
    category: r.cat_name ? { id: r.category_id, name: r.cat_name, color: r.cat_color } : null,
    account: r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
  };
}

// GET /api/templates/suggestions  (must be before "/:id" routes)
router.get("/suggestions", async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows: candidates } = await db.query(
      `SELECT lower(t.label) AS key, t.label, t.account_id, t.type,
              ROUND(AVG(t.amount), 2) AS avg_amount, COUNT(*) AS cnt
       FROM transactions t
       WHERE t.created_by = ?
       GROUP BY lower(t.label), t.account_id, t.type
       HAVING cnt >= 3`,
      [req.user!.id]
    );
    const { rows: templates } = await db.query(
      "SELECT lower(label) AS key, account_id, type FROM transaction_templates WHERE created_by = ?",
      [req.user!.id]
    );
    const tmplSet = new Set(
      (templates as any[]).map((t: any) => `${t.key}|${t.account_id}|${t.type}`)
    );
    const suggestions = (candidates as any[])
      .filter((c: any) => !tmplSet.has(`${c.key}|${c.account_id}|${c.type}`))
      .map((c: any) => ({
        label: c.label,
        accountId: c.account_id,
        type: c.type,
        avgAmount: c.avg_amount,
        count: c.cnt,
      }));
    res.json(suggestions);
  } catch (err) {
    next(err);
  }
});

// GET /api/templates[?type=income|expense]
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const { type } = req.query;
    let sql = `
      SELECT t.id, t.label, t.amount, t.type, t.category_id, t.account_id, t.note,
             c.name AS cat_name, c.color AS cat_color,
             a.name AS acc_name, a.color AS acc_color
      FROM transaction_templates t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN accounts   a ON a.id = t.account_id
      WHERE t.created_by = ?
    `;
    const params: any[] = [req.user!.id];
    if (type) {
      sql += " AND t.type = ?";
      params.push(type);
    }
    sql += " ORDER BY t.id DESC";
    const { rows } = await db.query(sql, params);
    res.json((rows as any[]).map(mapRow));
  } catch (err) {
    next(err);
  }
});

// POST /api/templates
router.post("/", async (req, res, next) => {
  try {
    const parsed = TemplateCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { label, amount, type, categoryId, accountId, note } = parsed.data;
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO transaction_templates (label, amount, type, category_id, account_id, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [label, amount, type, categoryId || null, accountId, note || null, req.user!.id]
    );
    res.status(201).json({ id: result.lastId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/templates/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = await getDb();
    const { rows } = await db.query("SELECT id FROM transaction_templates WHERE id = ? AND created_by = ?", [id, req.user!.id]);
    if ((rows as any[]).length === 0) return res.status(404).json({ error: "Not found" });

    const patchParsed = TemplatePatchSchema.safeParse(req.body);
    if (!patchParsed.success) return res.status(400).json({ error: patchParsed.error.flatten() });
    const fields: string[] = [];
    const values: any[] = [];
    const { label, amount, type, categoryId, accountId, note } = patchParsed.data;
    if (label !== undefined) { fields.push("label = ?"); values.push(label); }
    if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
    if (type !== undefined) { fields.push("type = ?"); values.push(type); }
    if (categoryId !== undefined) { fields.push("category_id = ?"); values.push(categoryId || null); }
    if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
    if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    await db.run(`UPDATE transaction_templates SET ${fields.join(", ")} WHERE id = ? AND created_by = ?`, [...values, id, req.user!.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/templates/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = await getDb();
    const result = await db.run("DELETE FROM transaction_templates WHERE id = ? AND created_by = ?", [id, req.user!.id]);
    if (result.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
