import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { myRole } from "../lib/members";

/**
 * Mitgliedschaften an Gemeinschaftskonten.
 *
 * - **Einladung über die exakte E-Mail-Adresse** (Punkt-Lookup, kein Auflisten
 *   fremder Nutzer — `GET /api/auth/users` bleibt admin-only).
 * - Die Mitgliedschaft entsteht als `pending` und wird erst durch **Annahme des
 *   Eingeladenen** aktiv. Vor der Annahme ist nichts sichtbar.
 * - Der **Admin weist nicht zu** — das Konto gehört dem Nutzer.
 * - Nur der Owner darf einladen, entfernen und löschen. Mitglieder dürfen alles
 *   Fachliche, aber die Mitgliederliste nicht ändern. **Keine Nur-Lesen-Rolle.**
 * - **Austritt:** Mitglieder dürfen selbst austreten, der Owner darf entfernen.
 *   Buchungen und Fixkosten gehören dem *Konto* — wer austritt, verliert nur die
 *   Sicht, Historie und Salden bleiben.
 */
const router = Router();

const InviteSchema = z.object({ email: z.string().email() });

// ── GET /api/accounts/:id/members ────────────────────────────────────────────
router.get("/accounts/:id/members", async (req, res, next) => {
  try {
    const db = await getDb();
    const role = await myRole(db, req.params.id, req.user!.id);
    if (role === null) return res.status(404).json({ error: "Account not found" });

    const { rows } = await db.query(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist der Mitgliedsbezug selbst
      `SELECT m.user_id, m.role, m.status, m.created_at, u.email, u.display_name
       FROM account_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.account_id = ?
       ORDER BY m.role DESC, m.id`,
      [req.params.id]
    );
    res.json(
      (rows as any[]).map((r) => ({
        userId: r.user_id,
        email: r.email,
        displayName: r.display_name || null,
        role: r.role,
        status: r.status,
        invitedAt: r.created_at,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ── POST /api/accounts/:id/members ───────────────────────────────────────────
router.post("/accounts/:id/members", async (req, res, next) => {
  try {
    const parsed = InviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const db = await getDb();
    const role = await myRole(db, req.params.id, req.user!.id);
    if (role === null) return res.status(404).json({ error: "Account not found" });
    if (role !== "owner") {
      return res.status(403).json({ error: "Nur der Eigentümer kann Mitglieder einladen." });
    }

    const { rows: accRows } = await db.query("SELECT is_shared FROM accounts WHERE id = ?", [req.params.id]);
    if (!accRows[0]?.is_shared) {
      return res.status(400).json({
        error: "Dieses Konto ist kein Gemeinschaftskonto. Wandle es zuerst um.",
      });
    }

    // Punkt-Lookup über die exakte Adresse: kein Auflisten, keine Teiltreffer.
    const { rows: userRows } = await db.query("SELECT id FROM users WHERE email = ?", [parsed.data.email]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: "Zu dieser E-Mail-Adresse gibt es kein Konto." });
    }
    const invitedId = Number(userRows[0].id);
    if (invitedId === req.user!.id) {
      return res.status(400).json({ error: "Du bist bereits Mitglied dieses Kontos." });
    }

    const existing = await myRole(db, req.params.id, invitedId);
    const { rows: pendingRows } = await db.query(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist der Mitgliedsbezug selbst
      "SELECT status FROM account_members WHERE account_id = ? AND user_id = ?",
      [req.params.id, invitedId]
    );
    if (existing !== null || pendingRows.length > 0) {
      return res.status(409).json({ error: "Diese Person ist bereits eingeladen oder Mitglied." });
    }

    await db.run(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist der Mitgliedsbezug selbst
      "INSERT INTO account_members (account_id, user_id, role, status) VALUES (?, ?, 'member', 'pending')",
      [req.params.id, invitedId]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/accounts/:id/members/:userId ─────────────────────────────────
router.delete("/accounts/:id/members/:userId", async (req, res, next) => {
  try {
    const db = await getDb();
    const targetId = Number(req.params.userId);
    const role = await myRole(db, req.params.id, req.user!.id);
    if (role === null) return res.status(404).json({ error: "Account not found" });

    const isSelf = targetId === req.user!.id;
    if (!isSelf && role !== "owner") {
      return res.status(403).json({ error: "Nur der Eigentümer kann Mitglieder entfernen." });
    }
    if (isSelf && role === "owner") {
      return res.status(400).json({
        error: "Der Eigentümer kann nicht austreten. Übertrage das Konto oder lösche es.",
      });
    }

    // Daten bleiben am Konto: wer austritt, verliert nur die Sicht. Historie und
    // Salden bleiben unberührt.
    const result = await db.run(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist der Mitgliedsbezug selbst
      "DELETE FROM account_members WHERE account_id = ? AND user_id = ? AND role <> 'owner'",
      [req.params.id, targetId]
    );
    if (result.changes === 0) return res.status(404).json({ error: "Mitgliedschaft nicht gefunden" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/invitations ─────────────────────────────────────────────────────
// Offene Einladungen an mich. Beim Eingeladenen erscheinen sie als gestrichelter
// Eintrag in der Kontoliste selbst — eine Einladung *ist* ein Konto in spe.
router.get("/invitations", async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist der Mitgliedsbezug selbst
      `SELECT m.account_id, a.name, a.color, u.email AS owner_email, u.display_name AS owner_name
       FROM account_members m
       JOIN accounts a ON a.id = m.account_id
       JOIN account_members om ON om.account_id = a.id AND om.role = 'owner'
       JOIN users u ON u.id = om.user_id
       WHERE m.user_id = ? AND m.status = 'pending'
       ORDER BY m.id`,
      [req.user!.id]
    );
    res.json(
      (rows as any[]).map((r) => ({
        accountId: r.account_id,
        name: r.name,
        color: r.color,
        invitedBy: r.owner_name || r.owner_email,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ── POST /api/invitations/:accountId/accept | /decline ───────────────────────
for (const [path, action] of [["accept", "accept"], ["decline", "decline"]] as const) {
  router.post(`/invitations/:accountId/${path}`, async (req, res, next) => {
    try {
      const db = await getDb();
      const { rows } = await db.query(
        // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist der Mitgliedsbezug selbst
        "SELECT id FROM account_members WHERE account_id = ? AND user_id = ? AND status = 'pending'",
        [req.params.accountId, req.user!.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Keine offene Einladung." });

      if (action === "accept") {
        await db.run("UPDATE account_members SET status = 'active' WHERE id = ?", [rows[0].id]);
      } else {
        await db.run("DELETE FROM account_members WHERE id = ?", [rows[0].id]);
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}

export default router;
