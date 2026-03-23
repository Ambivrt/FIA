/**
 * Trigger engine types and Zod schemas.
 * Defines the structure for declarative triggers in agent.yaml.
 */

import { z } from "zod";

// --- Zod Schemas ---

export const triggerEventSchema = z.enum([
  "task_completed",
  "task_approved",
  "task_activated",
  "task_delivered",
  "anomaly_detected",
]);

export const triggerConditionSchema = z.object({
  task_type: z.union([z.string(), z.array(z.string())]).optional(),
  output_field: z.string().optional(),
  output_value: z.union([z.string(), z.array(z.string())]).optional(),
  score_above: z.number().optional(),
  score_field: z.string().optional(),
});

export const triggerActionSchema = z.object({
  type: z.enum(["create_task", "notify_slack", "escalate", "update_config"]),
  target_agent: z.string().optional(),
  task_type: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  context_fields: z.array(z.string()).optional(),
  channel: z.string().optional(),
});

export const triggerConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  on: triggerEventSchema,
  condition: triggerConditionSchema.optional(),
  action: triggerActionSchema,
  requires_approval: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

// --- TypeScript Types (inferred from Zod) ---

export type TriggerEvent = z.infer<typeof triggerEventSchema>;
export type TriggerCondition = z.infer<typeof triggerConditionSchema>;
export type TriggerAction = z.infer<typeof triggerActionSchema>;
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

// --- Event-to-status mapping ---

export const EVENT_STATUS_MAP: Record<TriggerEvent, string> = {
  task_completed: "completed",
  task_approved: "approved",
  task_activated: "activated",
  task_delivered: "delivered",
  anomaly_detected: "completed", // anomaly detection triggers on completed with condition match
};
