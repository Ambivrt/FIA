// Delad CRON-jobb-service – CRUD mot scheduled_jobs via Supabase
// Används av CLI, Slack och potentiellt API

import cron from "node-cron";
import { SupabaseClient } from "@supabase/supabase-js";
import { isSchedulableTaskType } from "./task-types";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ScheduledJob {
  id: string;
  agent_id: string;
  cron_expression: string;
  task_type: string;
  title: string;
  priority: string;
  description: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_triggered_at: string | null;
  agents?: { slug: string; name: string };
}

export interface CreateJobInput {
  agent_id: string;
  cron_expression: string;
  task_type: string;
  title: string;
  priority?: string;
  description?: string;
  enabled?: boolean;
}

export interface UpdateJobInput {
  agent_id?: string;
  cron_expression?: string;
  task_type?: string;
  title?: string;
  priority?: string;
  description?: string;
  enabled?: boolean;
}

const VALID_PRIORITIES = ["critical", "high", "normal", "low"] as const;

// ─── Errors ─────────────────────────────────────────────────────────────────────

export class CronServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CronServiceError";
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function validateCronExpression(expr: string): void {
  if (!cron.validate(expr)) {
    throw new CronServiceError("INVALID_CRON", `Ogiltigt cron-uttryck: "${expr}"`);
  }
}

function validatePriority(p: string): void {
  if (!VALID_PRIORITIES.includes(p as (typeof VALID_PRIORITIES)[number])) {
    throw new CronServiceError("VALIDATION_ERROR", `Ogiltig prioritet "${p}". Giltiga: ${VALID_PRIORITIES.join(", ")}`);
  }
}

async function emitScheduleCommand(
  supabase: SupabaseClient,
  issuedBy: string,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("commands").insert({
    command_type: "update_schedule",
    target_slug: null,
    payload_json: { action, ...details },
    issued_by: issuedBy,
    status: "pending",
  });
  if (error) console.warn("[emitScheduleCommand] failed:", error.message);
}

// ─── Resolve helpers ────────────────────────────────────────────────────────────

export async function resolveAgentBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ id: string; slug: string; name: string }> {
  const { data, error } = await supabase.from("agents").select("id, slug, name").eq("slug", slug).single();

  if (error || !data) {
    throw new CronServiceError("AGENT_NOT_FOUND", `Agent "${slug}" hittades inte.`);
  }
  return data as { id: string; slug: string; name: string };
}

export async function resolveJobId(supabase: SupabaseClient, input: string): Promise<string> {
  // Full UUID – return as-is
  if (input.length === 36 && input.includes("-")) return input;

  // Prefix match
  const { data, error } = await supabase.from("scheduled_jobs").select("id").like("id", `${input}%`);

  if (error) throw new CronServiceError("DB_ERROR", error.message);
  if (!data || data.length === 0) {
    throw new CronServiceError("JOB_NOT_FOUND", `Inget jobb med ID-prefix "${input}".`);
  }
  if (data.length > 1) {
    throw new CronServiceError("AMBIGUOUS_ID", `"${input}" matchar ${data.length} jobb. Ange fler tecken.`);
  }
  return data[0].id;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────────

export async function listScheduledJobs(supabase: SupabaseClient): Promise<ScheduledJob[]> {
  const { data, error } = await supabase
    .from("scheduled_jobs")
    .select("*, agents!inner(slug, name)")
    .order("created_at");

  if (error) throw new CronServiceError("DB_ERROR", error.message);
  return (data ?? []) as unknown as ScheduledJob[];
}

export async function getScheduledJob(supabase: SupabaseClient, id: string): Promise<ScheduledJob> {
  const fullId = await resolveJobId(supabase, id);

  const { data, error } = await supabase
    .from("scheduled_jobs")
    .select("*, agents!inner(slug, name)")
    .eq("id", fullId)
    .single();

  if (error || !data) {
    throw new CronServiceError("JOB_NOT_FOUND", `Jobb "${id}" hittades inte.`);
  }
  return data as unknown as ScheduledJob;
}

export async function createScheduledJob(
  supabase: SupabaseClient,
  input: CreateJobInput,
  issuedBy: string,
): Promise<ScheduledJob> {
  validateCronExpression(input.cron_expression);
  if (input.priority) validatePriority(input.priority);

  // Validate task_type against agent's allowed types
  const { data: agentRow } = await supabase.from("agents").select("slug").eq("id", input.agent_id).single();
  if (agentRow?.slug && !isSchedulableTaskType(agentRow.slug, input.task_type)) {
    throw new CronServiceError(
      "VALIDATION_ERROR",
      `Ogiltig uppgiftstyp "${input.task_type}" för agent "${agentRow.slug}".`,
    );
  }

  const row = {
    agent_id: input.agent_id,
    cron_expression: input.cron_expression,
    task_type: input.task_type,
    title: input.title,
    priority: input.priority ?? "normal",
    description: input.description ?? null,
    enabled: input.enabled ?? true,
  };

  const { data, error } = await supabase.from("scheduled_jobs").insert(row).select("*").single();

  if (error) {
    if (error.message.includes("unique") || error.code === "23505") {
      throw new CronServiceError(
        "VALIDATION_ERROR",
        "Ett jobb med samma agent, task-type och cron-uttryck finns redan.",
      );
    }
    throw new CronServiceError("DB_ERROR", error.message);
  }

  await emitScheduleCommand(supabase, issuedBy, "create", {
    job_id: data.id,
    enabled: row.enabled,
  });

  return data as unknown as ScheduledJob;
}

export async function updateScheduledJob(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateJobInput,
  issuedBy: string,
): Promise<ScheduledJob> {
  const fullId = await resolveJobId(supabase, id);

  if (updates.cron_expression) validateCronExpression(updates.cron_expression);
  if (updates.priority) validatePriority(updates.priority);

  const { data, error } = await supabase
    .from("scheduled_jobs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", fullId)
    .select("*, agents!inner(slug, name)")
    .single();

  if (error) throw new CronServiceError("DB_ERROR", error.message);

  await emitScheduleCommand(supabase, issuedBy, "update", { job_id: fullId, ...updates });

  return data as unknown as ScheduledJob;
}

export async function deleteScheduledJob(supabase: SupabaseClient, id: string, issuedBy: string): Promise<void> {
  const fullId = await resolveJobId(supabase, id);

  const { error } = await supabase.from("scheduled_jobs").delete().eq("id", fullId);

  if (error) throw new CronServiceError("DB_ERROR", error.message);

  await emitScheduleCommand(supabase, issuedBy, "delete", { job_id: fullId });
}

export async function enableScheduledJob(
  supabase: SupabaseClient,
  id: string,
  issuedBy: string,
): Promise<ScheduledJob> {
  return updateScheduledJob(supabase, id, { enabled: true }, issuedBy);
}

export async function disableScheduledJob(
  supabase: SupabaseClient,
  id: string,
  issuedBy: string,
): Promise<ScheduledJob> {
  return updateScheduledJob(supabase, id, { enabled: false }, issuedBy);
}
