import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { accountIn, visibleAccounts } from "../lib/visibility";
import { checkAccountAndCategory } from "../lib/coupling";
import { BOOL_PARAM } from "../db/sql";
import {
  SalaryComponentInput,
  SalaryComponentPatch,
  SalaryInput,
  SalaryPatch,
  checkDerivation,
  checkLabel,
  loadSalaries,
  resolveComponentPatch,
  salaryPayload,
  selectVisibleComponents,
} from "../lib/salary";

/**
 * `/api/salaries` — eigene Routen, `/api/income` bleibt unberührt.
 *
 * **Granulare Posten-Operationen, kein „ganze Liste ersetzen".** Eine Nutzlast
 * `{ components: [...] }`, die die Postenliste austauscht, macht aus dem Deaktivieren
 * eines einzelnen Postens einen Lese-Ändern-Schreiben-Zyklus — und bei
 * last-write-wins (`CLAUDE.md`, „Frische-Mechanik") überschreibt der nicht ein Feld,
 * sondern die **ganze Postenliste** des anderen Mitglieds.
 *
 * Sichtbarkeit und Schreibrecht kommen ausschließlich aus `server/lib/salary.ts`:
 * `salary_components` trägt keine `account_id`, jedes Prädikat läuft über den Join
 * aufs Gehalt. Schreibrecht ist deckungsgleich mit Sichtbarkeit — wie bei
 * `income_sources`, jedes aktive Mitglied darf die Zeilen des anderen ändern.
 */
const router = Router();

/** Existenz und Sichtbarkeit eines Gehalts. `null` heißt 404, nicht 403. */
async function findSalary(db: any, id: string | number, accountIds: number[]) {
  const { rows } = await db.query(
    `SELECT * FROM salaries WHERE id = ? AND ${accountIn("account_id", accountIds)}`,
    [id]
  );
  return rows[0] ?? null;
}

// ── GET /api/salaries ────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const salaries = await loadSalaries(db, acc.all);

    const { rows: accounts } = await db.query(
      `SELECT id, name, color, is_shared FROM accounts WHERE ${accountIn("id", acc.all)}`
    );
    const accMap = new Map(accounts.map((a: any) => [Number(a.id), a]));

    res.json(
      salaries.map((s) => {
        const a = accMap.get(Number(s.account_id));
        return salaryPayload(
          s,
          a ? { id: a.id, name: a.name, color: a.color, isShared: !!a.is_shared } : null
        );
      })
    );
  } catch (err) {
    next(err);
  }
});

// ── POST /api/salaries ───────────────────────────────────────────────────────
/**
 * `components[]` ist optional und wird in **einer** Transaktion mit dem Gehalt
 * angelegt: bricht der Lauf in der Mitte ab, bleibt sonst ein Torso-Gehalt ohne
 * Posten stehen, das in jeder Summe als 0 € auftritt.
 */
const SalaryCreateSchema = SalaryInput.extend({
  components: z.array(SalaryComponentInput).optional(),
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = SalaryCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { employer, accountId, isActive, note, components } = parsed.data;

    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const coupling = await checkAccountAndCategory(db, req.user!.id, acc, accountId, null);
    if (coupling) return res.status(400).json({ error: coupling });

    for (const c of components ?? []) {
      const problem =
        checkLabel(c.kind, c.label) ??
        checkDerivation({
          amount: c.amount,
          hourlyRate: c.hourlyRate ?? null,
          hours: c.hours ?? null,
        });
      if (problem) return res.status(400).json({ error: problem });
    }

    const id = await db.transaction(async () => {
      const created = await db.run(
        `INSERT INTO salaries (employer, account_id, is_active, note, created_by)
         VALUES (?, ?, ${BOOL_PARAM}, ?, ?)`,
        [employer, accountId, isActive === false ? 0 : 1, note || null, req.user!.id]
      );
      const salaryId = Number(created.lastId);
      for (const c of components ?? []) {
        await insertComponent(db, salaryId, c, req.user!.id);
      }
      return salaryId;
    });

    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

async function insertComponent(
  db: any,
  salaryId: number,
  c: z.infer<typeof SalaryComponentInput>,
  userId: number
) {
  return db.run(
    `INSERT INTO salary_components
       (salary_id, kind, label, amount, type, hourly_rate, hours, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ${BOOL_PARAM}, ?)`,
    [
      salaryId,
      c.kind,
      c.label ?? null,
      c.amount,
      c.type,
      c.hourlyRate ?? null,
      c.hours ?? null,
      c.isActive === false ? 0 : 1,
      userId,
    ]
  );
}

// ── PATCH /api/salaries/:id ──────────────────────────────────────────────────
router.patch("/:id", async (req, res, next) => {
  try {
    const parsed = SalaryPatch.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { employer, accountId, isActive, note } = parsed.data;

    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    if (!(await findSalary(db, req.params.id, acc.all))) {
      return res.status(404).json({ error: "Gehalt nicht gefunden" });
    }

    const fields: string[] = [];
    const values: any[] = [];
    if (employer !== undefined) { fields.push("employer = ?"); values.push(employer); }
    // Kontowechsel ist erlaubt: die Posten tragen kein Konto und wandern von selbst
    // mit — ein einzelnes UPDATE genügt, es gibt nichts zu bewegen. Die
    // Bestätigungspflicht bei persönlich → geteilt sitzt in der Oberfläche, nicht hier:
    // sie schützt den Nutzer vor unbeabsichtigter Offenlegung, nicht das Modell.
    if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
    if (isActive !== undefined) { fields.push(`is_active = ${BOOL_PARAM}`); values.push(isActive ? 1 : 0); }
    if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
    if (fields.length === 0) return res.status(400).json({ error: "Keine Felder zum Ändern" });

    if (accountId !== undefined) {
      const coupling = await checkAccountAndCategory(db, req.user!.id, acc, accountId, null);
      if (coupling) return res.status(400).json({ error: coupling });
    }

    await db.run(
      `UPDATE salaries SET ${fields.join(", ")} WHERE id = ? AND ${accountIn("account_id", acc.all)}`,
      [...values, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/salaries/:id ─────────────────────────────────────────────────
// Die Posten hängen per `ON DELETE CASCADE` am Gehalt — die Kaskade sitzt in der
// Datenbank, nicht hier, weil der MCP ein zweiter Löschweg ist.
router.delete("/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const result = await db.run(
      `DELETE FROM salaries WHERE id = ? AND ${accountIn("account_id", acc.all)}`,
      [req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ error: "Gehalt nicht gefunden" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/salaries/:id/components ────────────────────────────────────────
router.post("/:id/components", async (req, res, next) => {
  try {
    const parsed = SalaryComponentInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const c = parsed.data;

    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    if (!(await findSalary(db, req.params.id, acc.all))) {
      return res.status(404).json({ error: "Gehalt nicht gefunden" });
    }

    const problem =
      checkLabel(c.kind, c.label) ??
      checkDerivation({
        amount: c.amount,
        hourlyRate: c.hourlyRate ?? null,
        hours: c.hours ?? null,
      });
    if (problem) return res.status(400).json({ error: problem });

    const created = await insertComponent(db, Number(req.params.id), c, req.user!.id);
    res.status(201).json({ id: created.lastId });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/salaries/:id/components/:cid ──────────────────────────────────
router.patch("/:id/components/:cid", async (req, res, next) => {
  try {
    const parsed = SalaryComponentPatch.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const patch = parsed.data;

    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);

    // Die Sichtbarkeit des Elternteils ist in dieser einen Abfrage mitgeprüft — der
    // Posten selbst trägt keine `account_id`.
    const { rows } = await db.query(
      selectVisibleComponents("c.*", acc.all, {
        where: "c.id = ? AND c.salary_id = ?",
      }),
      [req.params.cid, req.params.id]
    );
    const current = rows[0];
    if (!current) return res.status(404).json({ error: "Bestandteil nicht gefunden" });

    const kind = patch.kind ?? current.kind;
    const label = patch.label !== undefined ? patch.label : current.label;
    const problem = checkLabel(kind, label);
    if (problem) return res.status(400).json({ error: problem });

    // Zusammenführung und Invariante stehen im Baustein — MCP ändert Posten auch.
    const resolved = resolveComponentPatch(current, patch);
    if ("error" in resolved) return res.status(400).json({ error: resolved.error });
    const { hourlyRate, hours, discardDerivation, touchesDerivation } = resolved;

    const fields: string[] = [];
    const values: any[] = [];
    if (patch.kind !== undefined) { fields.push("kind = ?"); values.push(patch.kind); }
    if (patch.label !== undefined) { fields.push("label = ?"); values.push(patch.label || null); }
    if (patch.amount !== undefined) { fields.push("amount = ?"); values.push(patch.amount); }
    if (patch.type !== undefined) { fields.push("type = ?"); values.push(patch.type); }
    if (patch.isActive !== undefined) {
      fields.push(`is_active = ${BOOL_PARAM}`);
      values.push(patch.isActive ? 1 : 0);
    }
    if (discardDerivation || touchesDerivation) {
      fields.push("hourly_rate = ?", "hours = ?");
      values.push(hourlyRate, hours);
    }
    if (fields.length === 0) return res.status(400).json({ error: "Keine Felder zum Ändern" });

    await db.run(`UPDATE salary_components SET ${fields.join(", ")} WHERE id = ?`, [
      ...values,
      req.params.cid,
    ]);
    res.json({ ok: true, derivationDiscarded: discardDerivation });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/salaries/:id/components/:cid ─────────────────────────────────
router.delete("/:id/components/:cid", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const { rows } = await db.query(
      selectVisibleComponents("c.id", acc.all, { where: "c.id = ? AND c.salary_id = ?" }),
      [req.params.cid, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Bestandteil nicht gefunden" });

    // eslint-disable-next-line no-restricted-syntax -- Löschen per ID; die Sichtbarkeit ist eine Zeile höher über den Join geprüft, ein zweites Prädikat wäre hier nicht möglich (die Tabelle trägt keine account_id)
    await db.run("DELETE FROM salary_components WHERE id = ?", [req.params.cid]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/salaries/:id/adopt-income ──────────────────────────────────────
/**
 * Übernahme bestehender Einnahmen: angekreuzte `income_sources`-Zeilen werden Posten
 * dieses Gehalts, die Quellzeilen verschwinden — in **einer** Transaktion.
 *
 * Die Atomarität ist der ganze Zweck: halb ausgeführt heißt entweder Doppelzählung
 * (Posten angelegt, Einnahme steht noch) oder Datenverlust (Einnahme gelöscht, Posten
 * fehlt). Sie schützt den **Formularabbruch**, nicht den Agenten — deshalb gibt es
 * dieses Werkzeug im MCP ausdrücklich nicht: für ein Modell sind „Posten anlegen" und
 * „Einnahme löschen" zwei Aufrufe, die es auch einzeln richtig hinbekommt.
 *
 * Eigene Route statt eines Feldes an `POST /api/salaries`: die Übernahme trifft auch
 * ein **bestehendes** Gehalt (Jobwechsel, nachträgliches Aufräumen), und ein Feld an
 * der Anlage-Nutzlast könnte das nicht.
 *
 * **Dasselbe Konto auf beiden Seiten** ist Pflicht. Ohne die Regel verschöbe die
 * Übernahme still Geld zwischen zwei Räumen: die Einnahme verschwindet aus Raum A und
 * taucht als Posten in Raum B auf, weil der Posten das Konto des Gehalts erbt.
 */
const AdoptSchema = z.object({
  items: z
    .array(
      z.object({
        incomeId: z.number().int(),
        kind: SalaryComponentInput.shape.kind,
        label: z.string().min(1).nullable().optional(),
      })
    )
    .min(1),
});

router.post("/:id/adopt-income", async (req, res, next) => {
  try {
    const parsed = AdoptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { items } = parsed.data;

    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const salary = await findSalary(db, req.params.id, acc.all);
    if (!salary) return res.status(404).json({ error: "Gehalt nicht gefunden" });

    // Schreibrecht auf **beiden** Seiten, vor der Transaktion: die Quellzeilen müssen
    // sichtbar sein und auf demselben Konto liegen wie das Gehalt.
    const sources = new Map<number, any>();
    for (const item of items) {
      const { rows } = await db.query(
        `SELECT * FROM income_sources WHERE id = ? AND ${accountIn("account_id", acc.all)}`,
        [item.incomeId]
      );
      const row = rows[0];
      if (!row) {
        return res.status(404).json({ error: `Einnahme ${item.incomeId} nicht gefunden` });
      }
      if (Number(row.account_id) !== Number(salary.account_id)) {
        return res.status(400).json({
          error: `Einnahme ${item.incomeId} liegt auf einem anderen Konto als das Gehalt.`,
        });
      }
      sources.set(item.incomeId, row);
    }

    for (const item of items) {
      // `label` bleibt die Bezeichnung der Einnahme, wenn der Aufrufer keine schickt —
      // verbatim, ohne zu raten, ob sie dem Katalognamen entspricht. Der Editor zeigt
      // sie und der Nutzer kann sie leeren, dann greift der Katalogname.
      const label = item.label !== undefined ? item.label : sources.get(item.incomeId).label;
      const problem = checkLabel(item.kind, label);
      if (problem) return res.status(400).json({ error: problem });
    }

    const created = await db.transaction(async () => {
      const ids: number[] = [];
      for (const item of items) {
        const src = sources.get(item.incomeId);
        const label = item.label !== undefined ? item.label : src.label;
        const inserted = await insertComponent(
          db,
          Number(salary.id),
          {
            kind: item.kind,
            label: label || null,
            amount: Number(src.amount),
            type: src.type,
            hourlyRate: null,
            hours: null,
            isActive: !!src.is_active,
          },
          req.user!.id
        );
        ids.push(Number(inserted.lastId));
        await db.run("DELETE FROM income_sources WHERE id = ?", [item.incomeId]);
      }
      return ids;
    });

    res.status(201).json({ componentIds: created, adopted: created.length });
  } catch (err) {
    next(err);
  }
});

export default router;
