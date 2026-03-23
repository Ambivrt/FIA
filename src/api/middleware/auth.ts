import { Request, Response, NextFunction } from "express";
import { SupabaseClient } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  role: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the user's UUID for DB foreign keys, or undefined for non-UUID identifiers (e.g. CLI). */
export function getDbUserId(req: Request): string | undefined {
  const id = req.user?.id;
  return id && UUID_RE.test(id) ? id : undefined;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
    correlationId?: string;
  }
}

export function requireAuth(supabase: SupabaseClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header." } });
      return;
    }

    const token = header.slice(7);

    // CLI token bypass – om FIA_CLI_TOKEN finns i .env och matchar, skippa JWT-validering
    const cliToken = process.env.FIA_CLI_TOKEN;
    if (cliToken && token === cliToken) {
      req.user = { id: "cli", role: "admin" };
      return next();
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token." } });
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

    req.user = { id: user.id, role: profile?.role ?? "viewer" };
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Rollen '${req.user?.role ?? "unknown"}' har inte behörighet för denna åtgärd.`,
        },
      });
      return;
    }
    next();
  };
}
