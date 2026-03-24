import { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeRow, KnowledgeCategory } from "./types";
import type { LoadedSkill } from "../agents/agent-loader";

const CACHE_TTL_MS = 60_000; // 60 seconds

interface CacheEntry {
  data: KnowledgeRow[];
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(agentSlug: string, category?: KnowledgeCategory, taskType?: string): string {
  return `${agentSlug}:${category ?? "*"}:${taskType ?? "*"}`;
}

async function fetchKnowledge(
  supabase: SupabaseClient,
  agentSlug: string,
  category?: KnowledgeCategory,
  taskType?: string,
): Promise<KnowledgeRow[]> {
  const key = cacheKey(agentSlug, category, taskType);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  let query = supabase
    .from("agent_knowledge")
    .select("*")
    .eq("agent_slug", agentSlug)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (category) query = query.eq("category", category);
  if (taskType) query = query.eq("task_type", taskType);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as KnowledgeRow[];
  cache.set(key, { data: rows, cachedAt: Date.now() });
  return rows;
}

/**
 * Fetch skills for an agent. Includes shared (_shared) and agent-specific skills.
 */
export async function fetchAgentSkills(supabase: SupabaseClient, agentSlug: string): Promise<LoadedSkill[]> {
  // Fetch both shared and agent-specific skills
  const [shared, agentSpecific] = await Promise.all([
    fetchKnowledge(supabase, "_shared", "skill"),
    fetchKnowledge(supabase, agentSlug, "skill"),
  ]);

  return [...shared, ...agentSpecific].map((row) => ({
    metadata: {
      name: row.title,
      description: row.description,
      version: row.metadata?.version as string | undefined,
    },
    content: row.body,
    source: (row.source === "shared" || row.agent_slug === "_shared" ? "shared" : "agent") as "shared" | "agent",
  }));
}

/**
 * Fetch system context for an agent. Returns joined string.
 */
export async function fetchSystemContext(supabase: SupabaseClient, agentSlug: string): Promise<string> {
  const rows = await fetchKnowledge(supabase, agentSlug, "system_context");
  if (rows.length === 0) return "";
  return rows.map((r) => r.body).join("\n\n---\n\n");
}

/**
 * Fetch task context for a specific task type. Includes task_context and few_shot items.
 */
export async function fetchTaskContext(supabase: SupabaseClient, agentSlug: string, taskType: string): Promise<string> {
  const [taskCtx, fewShot] = await Promise.all([
    fetchKnowledge(supabase, agentSlug, "task_context", taskType),
    fetchKnowledge(supabase, agentSlug, "few_shot", taskType),
  ]);

  const all = [...taskCtx, ...fewShot];
  if (all.length === 0) return "";
  return all.map((r) => r.body).join("\n\n---\n\n");
}

/**
 * Invalidate the knowledge cache for a specific agent or all agents.
 */
export function invalidateKnowledgeCache(agentSlug?: string): void {
  if (agentSlug) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${agentSlug}:`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}
