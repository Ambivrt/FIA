import { Request, Response, NextFunction } from "express";

export type UserRole = "admin" | "orchestrator" | "reviewer" | "viewer" | "external";

export type Permission =
  | "view_dashboard"
  | "view_published_content"
  | "approve_reject_tasks"
  | "give_feedback"
  | "create_tasks"
  | "pause_resume_agents"
  | "kill_switch"
  | "manage_triggers"
  | "view_costs"
  | "view_knowledge"
  | "edit_knowledge"
  | "agent_routing_tools"
  | "drive_setup"
  | "knowledge_reseed"
  | "user_management"
  | "view_activity_log"
  | "view_agents"
  | "view_calendar";

const ALL_PERMISSIONS: Permission[] = [
  "view_dashboard",
  "view_published_content",
  "approve_reject_tasks",
  "give_feedback",
  "create_tasks",
  "pause_resume_agents",
  "kill_switch",
  "manage_triggers",
  "view_costs",
  "view_knowledge",
  "edit_knowledge",
  "agent_routing_tools",
  "drive_setup",
  "knowledge_reseed",
  "user_management",
  "view_activity_log",
  "view_agents",
  "view_calendar",
];

export const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  admin: new Set(ALL_PERMISSIONS),

  orchestrator: new Set([
    "view_dashboard",
    "view_published_content",
    "approve_reject_tasks",
    "give_feedback",
    "create_tasks",
    "pause_resume_agents",
    "kill_switch",
    "manage_triggers",
    "view_costs",
    "view_knowledge",
    "edit_knowledge",
    "view_activity_log",
    "view_agents",
    "view_calendar",
  ]),

  reviewer: new Set([
    "view_dashboard",
    "view_published_content",
    "approve_reject_tasks",
    "give_feedback",
    "create_tasks",
    "view_knowledge",
    "view_activity_log",
    "view_agents",
    "view_calendar",
  ]),

  viewer: new Set(["view_dashboard", "view_published_content", "view_activity_log", "view_agents", "view_calendar"]),

  external: new Set(["view_published_content", "give_feedback"]),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isValidRole(role: string): role is UserRole {
  return role in ROLE_PERMISSIONS;
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !isValidRole(role) || !permissions.some((p) => hasPermission(role, p))) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Rollen '${role ?? "unknown"}' har inte behörighet för denna åtgärd.`,
        },
      });
      return;
    }
    next();
  };
}
