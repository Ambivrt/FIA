import { SupabaseClient } from "@supabase/supabase-js";
import { isValidTransition, shouldSetCompletedAt } from "../engine/status-machine";

export interface TaskInput {
  agent_id: string;
  type: string;
  title: string;
  status?: string;
  priority?: string;
  content_json?: Record<string, unknown>;
  model_used?: string;
  tokens_used?: number;
  cost_sek?: number;
  source?: string;
  parent_task_id?: string;
  trigger_source?: string;
}

export interface ApprovalInput {
  task_id: string;
  reviewer_type: "brand_agent" | "orchestrator" | "admin" | "ledningsgrupp";
  reviewer_id?: string;
  decision: "approved" | "rejected" | "revision_requested";
  feedback?: string;
}

export async function createTask(supabase: SupabaseClient, task: TaskInput): Promise<string> {
  const { data, error } = await supabase.from("tasks").insert(task).select("id").single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data.id;
}

export async function updateTaskStatus(
  supabase: SupabaseClient,
  taskId: string,
  status: string,
  extras?: Record<string, unknown>,
): Promise<void> {
  // Validate transition if current status is provided
  if (extras?.currentStatus != null) {
    const from = extras.currentStatus as string;
    if (!isValidTransition(from, status)) {
      console.warn(`[task-writer] Invalid status transition: ${from} → ${status} for task ${taskId}`);
    }
  }

  const completedAt = shouldSetCompletedAt(status) ? new Date().toISOString() : undefined;

  const updatePayload: Record<string, unknown> = { status };

  if (extras?.content_json != null) {
    updatePayload.content_json = extras.content_json;
  }
  if (extras?.model_used != null) {
    updatePayload.model_used = extras.model_used;
  }
  if (extras?.tokens_used != null) {
    updatePayload.tokens_used = extras.tokens_used;
  }
  if (extras?.cost_sek != null) {
    updatePayload.cost_sek = extras.cost_sek;
  }
  if (completedAt != null) {
    updatePayload.completed_at = completedAt;
  }

  const { error } = await supabase.from("tasks").update(updatePayload).eq("id", taskId);

  if (error) throw new Error(`Failed to update task ${taskId}: ${error.message}`);
}

export async function recoverOrphanedTasks(supabase: SupabaseClient): Promise<{ queued: number; inProgress: number }> {
  const now = new Date().toISOString();

  const { data: qData, error: qErr } = await supabase
    .from("tasks")
    .update({ status: "error", completed_at: now })
    .eq("status", "queued")
    .select("id");

  if (qErr) throw new Error(`Failed to recover queued tasks: ${qErr.message}`);

  const { data: ipData, error: ipErr } = await supabase
    .from("tasks")
    .update({ status: "error", completed_at: now })
    .eq("status", "in_progress")
    .select("id");

  if (ipErr) throw new Error(`Failed to recover in_progress tasks: ${ipErr.message}`);

  return { queued: qData?.length ?? 0, inProgress: ipData?.length ?? 0 };
}

export async function purgeOrphanedTasks(
  supabase: SupabaseClient,
  maxAgeMinutes: number = 30,
): Promise<{ queued: number; inProgress: number }> {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  const { data: qData, error: qErr } = await supabase
    .from("tasks")
    .update({ status: "error", completed_at: now })
    .eq("status", "queued")
    .lt("created_at", cutoff)
    .select("id");

  if (qErr) throw new Error(`Failed to purge queued tasks: ${qErr.message}`);

  const { data: ipData, error: ipErr } = await supabase
    .from("tasks")
    .update({ status: "error", completed_at: now })
    .eq("status", "in_progress")
    .lt("created_at", cutoff)
    .select("id");

  if (ipErr) throw new Error(`Failed to purge in_progress tasks: ${ipErr.message}`);

  return { queued: qData?.length ?? 0, inProgress: ipData?.length ?? 0 };
}

export async function createApproval(supabase: SupabaseClient, approval: ApprovalInput): Promise<string> {
  const { data, error } = await supabase.from("approvals").insert(approval).select("id").single();

  if (error) throw new Error(`Failed to create approval: ${error.message}`);
  return data.id;
}
