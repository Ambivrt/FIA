/**
 * Trigger Engine — evaluates and executes declarative triggers from agent.yaml.
 *
 * Called after every task status change. Matches triggers by event + condition,
 * then either auto-executes or creates a pending_trigger for approval.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { loadAgentManifest } from "../agents/agent-loader";
import { createTask } from "../supabase/task-writer";
import { logActivity } from "../supabase/activity-writer";
import { Logger } from "../gateway/logger";
import { TriggerConfig, EVENT_STATUS_MAP } from "./trigger-types";

const MAX_TRIGGER_DEPTH = 3;

export interface TaskRecord {
  id: string;
  agent_id: string;
  type: string;
  title: string;
  status: string;
  priority: string;
  content_json: Record<string, unknown> | null;
  parent_task_id: string | null;
  trigger_source: string | null;
}

/**
 * Main entry point — called after a task's status is updated.
 */
export async function onTaskStatusChange(
  supabase: SupabaseClient,
  task: TaskRecord,
  newStatus: string,
  knowledgeDir: string,
  logger: Logger,
): Promise<void> {
  // Resolve agent slug from agent_id
  const { data: agent } = await supabase.from("agents").select("slug").eq("id", task.agent_id).single();

  if (!agent) {
    logger.warn("Trigger engine: agent not found", { task_id: task.id });
    return;
  }

  let manifest;
  try {
    manifest = loadAgentManifest(knowledgeDir, agent.slug);
  } catch {
    // Agent has no manifest or it's malformed — skip triggers
    return;
  }

  const triggers = manifest.triggers ?? [];
  if (triggers.length === 0) return;

  // Check trigger depth to prevent loops
  const depth = await getTriggerDepth(supabase, task.id);
  if (depth >= MAX_TRIGGER_DEPTH) {
    logger.warn("Trigger engine: max depth reached, skipping triggers", {
      task_id: task.id,
      agent: agent.slug,
    });
    return;
  }

  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    if (!matchesEvent(trigger.on, newStatus)) continue;
    if (trigger.condition && !matchesCondition(trigger.condition, task)) continue;

    logger.info(`Trigger matched: ${trigger.name}`, {
      task_id: task.id,
      agent: agent.slug,
      action: "trigger_matched",
    });

    try {
      if (trigger.requires_approval) {
        await createPendingTrigger(supabase, task, trigger);
        logger.info(`Pending trigger created: ${trigger.name}`, {
          task_id: task.id,
          agent: agent.slug,
          action: "pending_trigger_created",
        });
      } else {
        await executeTrigger(supabase, task, trigger, knowledgeDir, logger);
      }
    } catch (err) {
      logger.error(`Trigger execution failed: ${trigger.name}`, {
        task_id: task.id,
        agent: agent.slug,
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Check if a trigger event matches the new status.
 */
export function matchesEvent(triggerOn: string, newStatus: string): boolean {
  const expectedStatus = EVENT_STATUS_MAP[triggerOn as keyof typeof EVENT_STATUS_MAP];
  return expectedStatus === newStatus;
}

/**
 * Evaluate all conditions (AND logic) against a task.
 */
export function matchesCondition(condition: TriggerConfig["condition"], task: TaskRecord): boolean {
  if (!condition) return true;

  // task_type match
  if (condition.task_type != null) {
    const types = Array.isArray(condition.task_type) ? condition.task_type : [condition.task_type];
    if (!types.includes(task.type)) return false;
  }

  // output_field + output_value match
  if (condition.output_field != null && condition.output_value != null) {
    const fieldValue = getNestedField(task.content_json, condition.output_field);
    if (fieldValue == null) return false;
    const values = Array.isArray(condition.output_value) ? condition.output_value : [condition.output_value];
    if (!values.includes(String(fieldValue))) return false;
  }

  // score_field + score_above match
  if (condition.score_field != null && condition.score_above != null) {
    const scoreValue = getNestedField(task.content_json, condition.score_field);
    if (scoreValue == null || typeof scoreValue !== "number") return false;
    if (scoreValue <= condition.score_above) return false;
  }

  return true;
}

/**
 * Execute a trigger — create downstream task, send notification, or escalate.
 */
export async function executeTrigger(
  supabase: SupabaseClient,
  sourceTask: TaskRecord,
  trigger: TriggerConfig,
  knowledgeDir: string,
  logger: Logger,
): Promise<void> {
  const action = trigger.action;

  switch (action.type) {
    case "create_task": {
      if (!action.target_agent || !action.task_type) {
        logger.warn(`Trigger ${trigger.name}: missing target_agent or task_type`);
        return;
      }

      // Resolve target agent ID
      const { data: targetAgent } = await supabase.from("agents").select("id").eq("slug", action.target_agent).single();

      if (!targetAgent) {
        logger.warn(`Trigger ${trigger.name}: target agent '${action.target_agent}' not found`);
        return;
      }

      const context = extractContextFields(sourceTask, action.context_fields);

      const newTaskId = await createTask(supabase, {
        agent_id: targetAgent.id,
        type: action.task_type,
        title: `${action.task_type} (trigger: ${trigger.name})`,
        priority: action.priority ?? "normal",
        status: "queued",
        content_json: context,
        source: "trigger",
        parent_task_id: sourceTask.id,
        trigger_source: trigger.name,
      });

      // Update source task to triggered status
      await supabase.from("tasks").update({ status: "triggered" }).eq("id", sourceTask.id);

      await logActivity(supabase, {
        action: "trigger_executed",
        details_json: {
          trigger_name: trigger.name,
          source_task_id: sourceTask.id,
          new_task_id: newTaskId,
          target_agent: action.target_agent,
          target_task_type: action.task_type,
        },
      });

      logger.info(`Trigger executed: ${trigger.name} → created task ${newTaskId}`, {
        task_id: sourceTask.id,
        action: "trigger_executed",
      });
      break;
    }

    case "notify_slack": {
      // Slack notification — log intent, actual Slack integration deferred
      logger.info(`Trigger ${trigger.name}: Slack notification to ${action.channel}`, {
        task_id: sourceTask.id,
        action: "trigger_notify_slack",
      });

      await logActivity(supabase, {
        action: "trigger_notify_slack",
        details_json: {
          trigger_name: trigger.name,
          source_task_id: sourceTask.id,
          channel: action.channel,
        },
      });
      break;
    }

    case "escalate": {
      // Create escalation as a pending trigger for Orchestrator
      await createPendingTrigger(supabase, sourceTask, {
        ...trigger,
        requires_approval: true,
      });

      logger.info(`Trigger ${trigger.name}: escalated to Orchestrator`, {
        task_id: sourceTask.id,
        action: "trigger_escalated",
      });
      break;
    }

    default:
      logger.warn(`Trigger ${trigger.name}: unknown action type '${action.type}'`);
  }
}

/**
 * Create a pending trigger for Orchestrator approval.
 */
async function createPendingTrigger(
  supabase: SupabaseClient,
  sourceTask: TaskRecord,
  trigger: TriggerConfig,
): Promise<string> {
  const context = extractContextFields(sourceTask, trigger.action.context_fields);

  const { data, error } = await supabase
    .from("pending_triggers")
    .insert({
      source_task_id: sourceTask.id,
      trigger_name: trigger.name,
      target_agent_slug: trigger.action.target_agent ?? "orchestrator",
      target_task_type: trigger.action.task_type ?? trigger.action.type,
      priority: trigger.action.priority ?? "normal",
      context_json: context,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create pending trigger: ${error.message}`);
  return data.id;
}

/**
 * Walk the parent_task_id chain to determine trigger depth.
 */
export async function getTriggerDepth(supabase: SupabaseClient, taskId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = taskId;

  while (currentId && depth < MAX_TRIGGER_DEPTH + 1) {
    const result = await supabase.from("tasks").select("parent_task_id").eq("id", currentId).single();

    const parentId = result.data?.parent_task_id as string | null;
    if (!parentId) break;
    currentId = parentId;
    depth++;
  }

  return depth;
}

/**
 * Extract fields from task content_json using dot-notation paths.
 */
export function extractContextFields(task: TaskRecord, fields?: string[]): Record<string, unknown> {
  if (!fields || fields.length === 0) return {};

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field === "title") {
      result.title = task.title;
    } else {
      const value = getNestedField(task.content_json, field);
      if (value != null) {
        // Use the last segment of the dot-path as key
        const key = field.includes(".") ? field.split(".").pop()! : field;
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Get a nested field from an object using dot-notation.
 */
function getNestedField(obj: Record<string, unknown> | null, path: string): unknown {
  if (!obj) return undefined;

  // Strip leading "content_json." prefix if present
  const cleanPath = path.startsWith("content_json.") ? path.slice("content_json.".length) : path;
  const parts = cleanPath.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
