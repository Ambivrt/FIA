import { SupabaseClient } from "@supabase/supabase-js";

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
}

export interface ApprovalInput {
  task_id: string;
  reviewer_type: "brand_agent" | "orchestrator" | "admin" | "ledningsgrupp";
  reviewer_id?: string;
  decision: "approved" | "rejected" | "revision_requested";
  feedback?: string;
}

export async function createTask(
  supabase: SupabaseClient,
  task: TaskInput
): Promise<string> {
  const { data, error } = await supabase
    .from("tasks")
    .insert(task)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data.id;
}

export async function updateTaskStatus(
  supabase: SupabaseClient,
  taskId: string,
  status: string,
  extras?: Record<string, unknown>
): Promise<void> {
  const update: Record<string, unknown> = { status, ...extras };
  if (status === "published" || status === "approved") {
    update.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("tasks").update(update).eq("id", taskId);
  if (error) throw new Error(`Failed to update task ${taskId}: ${error.message}`);
}

export async function recoverOrphanedTasks(
  supabase: SupabaseClient
): Promise<{ queued: number; inProgress: number }> {
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
  maxAgeMinutes: number = 30
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

export async function createApproval(
  supabase: SupabaseClient,
  approval: ApprovalInput
): Promise<string> {
  const { data, error } = await supabase
    .from("approvals")
    .insert(approval)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create approval: ${error.message}`);
  return data.id;
}
