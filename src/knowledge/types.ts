export type KnowledgeCategory = "skill" | "system_context" | "task_context" | "few_shot" | "memory";

export interface KnowledgeRow {
  id: string;
  agent_slug: string;
  category: KnowledgeCategory;
  task_type: string | null;
  slug: string;
  title: string;
  description: string;
  body: string;
  metadata: Record<string, unknown>;
  sort_order: number;
  enabled: boolean;
  source: string;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeInsert {
  agent_slug: string;
  category: KnowledgeCategory;
  task_type?: string | null;
  slug: string;
  title: string;
  description?: string;
  body: string;
  metadata?: Record<string, unknown>;
  sort_order?: number;
  enabled?: boolean;
  source?: string;
  version?: number;
}
