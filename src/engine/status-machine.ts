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

// --- Sub-statuses (informational metadata on in_progress) ---

export type TaskSubStatus =
  // Intelligence
  | "gathering"
  | "analyzing"
  | "compiling"
  | "awaiting_input"
  // Content
  | "generating"
  | "screening"
  | "revising"
  | "brand_reviewing"
  // Brand
  | "text_review"
  | "visual_review"
  // Strategy
  | "researching"
  | "drafting"
  | "aligning"
  | null;

export const VALID_SUB_STATUSES: Record<string, TaskSubStatus[]> = {
  in_progress: [
    "gathering",
    "analyzing",
    "compiling",
    "awaiting_input",
    "generating",
    "screening",
    "revising",
    "brand_reviewing",
    "text_review",
    "visual_review",
    "researching",
    "drafting",
    "aligning",
  ],
};

export function isValidSubStatus(status: string, subStatus: string | null): boolean {
  if (subStatus === null) return true;
  const allowed = VALID_SUB_STATUSES[status];
  if (!allowed) return false;
  return allowed.includes(subStatus as TaskSubStatus);
}
