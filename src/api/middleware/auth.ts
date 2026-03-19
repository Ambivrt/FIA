import { Request, Response, NextFunction } from "express";
import { SupabaseClient } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      correlationId?: string;
    }
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
