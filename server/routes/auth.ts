import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb } from "../db";
import { BOOL_PARAM } from "../db/sql";
import { migrateOrphanedData } from "../db/migrate";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  requireAuth,
  requireAdmin,
  generateApiKey,
  hashApiKey,
} from "../auth/middleware";

const router = Router();

const BCRYPT_ROUNDS = 12;

const STARTER_CATEGORIES = [
  { name: "Miete & Wohnen", color: "#ef4444", icon: "Home" },
  { name: "Lebensmittel", color: "#f97316", icon: "ShoppingCart" },
  { name: "Transport", color: "#3b82f6", icon: "Car" },
  { name: "Versicherungen", color: "#8b5cf6", icon: "Shield" },
  { name: "Freizeit", color: "#10b981", icon: "Gamepad2" },
  { name: "Gesundheit", color: "#ec4899", icon: "Heart" },
  { name: "Abonnements", color: "#6366f1", icon: "CreditCard" },
  { name: "Sonstiges", color: "#6b7280", icon: "MoreHorizontal" },
];

// ── Rate limiting (in-memory) ─────────────────────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 5;
}

// ── GET /api/auth/status ──────────────────────────────────────────────────
router.get("/status", async (_req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query("SELECT COUNT(*) as count FROM users");
    res.json({ setupComplete: Number(rows[0].count) > 0 });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/setup ─────────────────────────────────────────────────
const SetupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).optional(),
});

router.post("/setup", async (req, res, next) => {
  try {
    const db = await getDb();

    // Only allowed when no users exist
    const { rows: existing } = await db.query(
      "SELECT COUNT(*) as count FROM users"
    );
    if (Number(existing[0].count) > 0) {
      res.status(409).json({ error: "Setup already completed" });
      return;
    }

    const parsed = SetupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { email, password, displayName } = parsed.data;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await db.run(
      "INSERT INTO users (email, password_hash, display_name, is_admin) VALUES (?, ?, ?, 1)",
      [email, passwordHash, displayName || null]
    );
    const userId = result.lastId;

    // Migrate orphaned data from single-user era
    const migration = await migrateOrphanedData(db, userId);

    // Create starter categories if user has none after migration
    const { rows: catCount } = await db.query(
      "SELECT COUNT(*) as count FROM categories WHERE user_id = ?",
      [userId]
    );
    if (Number(catCount[0].count) === 0) {
      for (const cat of STARTER_CATEGORIES) {
        await db.run(
          "INSERT INTO categories (name, color, icon, user_id) VALUES (?, ?, ?, ?)",
          [cat.name, cat.color, cat.icon, userId]
        );
      }
    }

    const user = { id: userId, email, isAdmin: true };
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(userId);

    res.status(201).json({ token, refreshToken, user, migration });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const ip = req.ip || "unknown";
    if (!checkRateLimit(ip)) {
      res
        .status(429)
        .json({ error: "Zu viele Login-Versuche. Bitte warten." });
      return;
    }

    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { email, password } = parsed.data;
    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (rows.length === 0) {
      res.status(401).json({ error: "E-Mail oder Passwort falsch" });
      return;
    }

    const dbUser = rows[0];
    const valid = await bcrypt.compare(password, dbUser.password_hash);
    if (!valid) {
      res.status(401).json({ error: "E-Mail oder Passwort falsch" });
      return;
    }

    const user = {
      id: dbUser.id,
      email: dbUser.email,
      isAdmin: !!dbUser.is_admin,
    };
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(dbUser.id);

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: dbUser.display_name,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────
router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    let payload: any;
    try {
      payload = verifyToken(refreshToken);
    } catch {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    if (payload.type !== "refresh") {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM users WHERE id = ?", [
      payload.id,
    ]);
    if (rows.length === 0) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const dbUser = rows[0];
    const user = {
      id: dbUser.id,
      email: dbUser.email,
      isAdmin: !!dbUser.is_admin,
    };
    const token = signAccessToken(user);

    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM users WHERE id = ?", [
      req.user!.id,
    ]);
    if (rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const u = rows[0];
    res.json({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      isAdmin: !!u.is_admin,
    });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Admin-only user management
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/auth/users ───────────────────────────────────────────────────
router.get("/users", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT id, email, display_name, is_admin, created_at FROM users ORDER BY id"
    );
    res.json(
      rows.map((u: any) => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        isAdmin: !!u.is_admin,
        createdAt: u.created_at,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/users ──────────────────────────────────────────────────
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).optional(),
  isAdmin: z.boolean().optional(),
});

router.post("/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { email, password, displayName, isAdmin } = parsed.data;
    const db = await getDb();

    // Check uniqueness
    const { rows: existing } = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existing.length > 0) {
      res.status(409).json({ error: "E-Mail wird bereits verwendet" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await db.run(
      `INSERT INTO users (email, password_hash, display_name, is_admin) VALUES (?, ?, ?, ${BOOL_PARAM})`,
      [email, passwordHash, displayName || null, isAdmin ? 1 : 0]
    );
    const userId = result.lastId;

    // Create starter categories for new user
    for (const cat of STARTER_CATEGORIES) {
      await db.run(
        "INSERT INTO categories (name, color, icon, user_id) VALUES (?, ?, ?, ?)",
        [cat.name, cat.color, cat.icon, userId]
      );
    }

    res.status(201).json({ id: userId });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/auth/users/:id ─────────────────────────────────────────────
const UpdateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  isAdmin: z.boolean().optional(),
});

router.patch(
  "/users/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const parsed = UpdateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const db = await getDb();
      const { rows } = await db.query("SELECT id FROM users WHERE id = ?", [
        id,
      ]);
      if (rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const { displayName, password, isAdmin } = parsed.data;
      const fields: string[] = [];
      const values: any[] = [];

      if (displayName !== undefined) {
        fields.push("display_name = ?");
        values.push(displayName);
      }
      if (password !== undefined) {
        fields.push("password_hash = ?");
        values.push(await bcrypt.hash(password, BCRYPT_ROUNDS));
      }
      if (isAdmin !== undefined) {
        fields.push(`is_admin = ${BOOL_PARAM}`);
        values.push(isAdmin ? 1 : 0);
      }

      if (fields.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      await db.run(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, [
        ...values,
        id,
      ]);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/auth/users/:id ────────────────────────────────────────────
router.delete(
  "/users/:id",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);

      // Cannot delete yourself
      if (id === req.user!.id) {
        res
          .status(400)
          .json({ error: "Eigenen Account kann man nicht löschen" });
        return;
      }

      const db = await getDb();
      const result = await db.run("DELETE FROM users WHERE id = ?", [id]);
      if (result.changes === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Cascade: delete user's data
      for (const table of [
        "expense_items",
        "income_sources",
        "transactions",
        "transaction_templates",
        "goals",
        "accounts",
        "categories",
      ]) {
        await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [id]);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════
// API key management
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/auth/api-keys ────────────────────────────────────────────────
router.get("/api-keys", requireAuth, async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT id, label, created_at FROM api_keys WHERE user_id = ? ORDER BY id",
      [req.user!.id]
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        label: r.label,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/api-keys ───────────────────────────────────────────────
const ApiKeyCreateSchema = z.object({
  label: z.string().min(1).optional(),
});

router.post("/api-keys", requireAuth, async (req, res, next) => {
  try {
    const parsed = ApiKeyCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const label = parsed.data.label || null;

    const db = await getDb();
    const result = await db.run(
      "INSERT INTO api_keys (user_id, key_hash, label) VALUES (?, ?, ?)",
      [req.user!.id, keyHash, label]
    );

    // Return the raw key ONCE — it cannot be retrieved later
    res.status(201).json({ id: result.lastId, key: rawKey, label });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/auth/api-keys/:id ─────────────────────────────────────────
router.delete("/api-keys/:id", requireAuth, async (req, res, next) => {
  try {
    const db = await getDb();
    const result = await db.run(
      "DELETE FROM api_keys WHERE id = ? AND user_id = ?",
      [req.params.id, req.user!.id]
    );
    if (result.changes === 0) {
      res.status(404).json({ error: "API key not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
