import { z } from "zod";

const priorityEnum = z.enum(["urgent", "high", "normal", "low"]);

const triggerConditionPatch = z
  .object({
    task_type: z.union([z.string(), z.array(z.string()).nonempty()]).optional(),
    output_field: z.string().max(100).optional(),
    output_value: z.union([z.string(), z.array(z.string()).nonempty()]).optional(),
    score_field: z.string().max(100).optional(),
    score_above: z.number().min(0).max(1).optional(),
  })
  .optional();

const triggerActionPatch = z
  .object({
    target_agent: z.string().optional(),
    task_type: z.string().min(1).optional(),
    priority: priorityEnum.optional(),
    context_fields: z.array(z.string()).optional(),
    channel: z.string().optional(),
  })
  .optional();

const triggerPatchItem = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  requires_approval: z.boolean().optional(),
  condition: triggerConditionPatch,
  action: triggerActionPatch,
});

export const triggersPatchSchema = z.object({
  triggers: z.array(triggerPatchItem).min(1).max(20),
});

export const reseedSchema = z.object({
  confirm: z.boolean().optional(),
});

export type TriggerPatchItem = z.infer<typeof triggerPatchItem>;
