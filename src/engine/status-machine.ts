/**
 * Task status state machine.
 * Defines valid status transitions and enforces them.
 */

export type TaskStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "delivered"
  | "activated"
  | "triggered"
  | "acknowledged"
  | "live"
  | "paused_task"
  | "ended"
  | "published" // deprecated
  | "error";

export const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ["in_progress"],
  in_progress: ["completed", "awaiting_review", "error"],
  completed: ["awaiting_review", "delivered", "triggered", "acknowledged"],
  awaiting_review: ["approved", "rejected", "revision_requested"],
  approved: ["delivered", "activated", "live"],
  rejected: [], // terminal
  revision_requested: ["in_progress"],
  delivered: ["acknowledged", "triggered"],
  activated: ["triggered"],
  triggered: [], // terminal
  acknowledged: [], // terminal
  live: ["paused_task", "ended", "error"],
  paused_task: ["live", "ended"],
  ended: [], // terminal
  published: [], // deprecated, terminal
  error: ["queued"], // manual retry
};

export const TERMINAL_STATUSES = new Set<string>(["rejected", "triggered", "acknowledged", "ended", "published"]);

export const COMPLETED_STATUSES = new Set<string>([
  "delivered",
  "ended",
  "triggered",
  "acknowledged",
  "published",
  "approved",
]);

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Statuses that should set completed_at timestamp.
 */
export function shouldSetCompletedAt(status: string): boolean {
  return COMPLETED_STATUSES.has(status);
}
