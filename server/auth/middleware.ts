import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getDb } from "../db";

export interface AuthUser {
  id: number;
  email: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, isAdmin: user.isAdmin },
    getJwtSecret(),
    { expiresIn: "15m" }
  );
}

export function signRefreshToken(userId: number): string {
  return jwt.sign({ id: userId, type: "refresh" }, getJwtSecret(), {
    expiresIn: "30d",
  });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, getJwtSecret());
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  return `ft_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * JWT auth middleware. Extracts Bearer token from Authorization header,
 * verifies it, and sets req.user. Returns 401 if invalid.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice(7);

  // Try JWT first
  try {
    const payload = verifyToken(token);
    if (payload.type === "refresh") {
      res.status(401).json({ error: "Access token required" });
      return;
    }
    req.user = {
      id: payload.id,
      email: payload.email,
      isAdmin: !!payload.isAdmin,
    };
    next();
    return;
  } catch {
    // Not a valid JWT — try API key
  }

  // Try API key
  try {
    const keyHash = hashApiKey(token);
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT ak.user_id, u.email, u.is_admin
       FROM api_keys ak
       JOIN users u ON u.id = ak.user_id
       WHERE ak.key_hash = ?`,
      [keyHash]
    );
    if (rows.length > 0) {
      req.user = {
        id: rows[0].user_id,
        email: rows[0].email,
        isAdmin: !!rows[0].is_admin,
      };
      next();
      return;
    }
  } catch {
    // API key lookup failed
  }

  res.status(401).json({ error: "Invalid or expired token" });
}

/**
 * Admin-only middleware. Must be used after requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
