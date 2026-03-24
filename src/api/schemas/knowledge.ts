import { z } from "zod";

export const knowledgeReseedSchema = z.object({
  confirm: z.boolean().optional(),
  agent_slug: z.string().optional(),
});
