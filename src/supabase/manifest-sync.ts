import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { getAllAgentSlugs } from "../agents/agent-factory";
import { loadAgentManifest, AgentManifest } from "../agents/agent-loader";
import { TriggerConfig } from "../engine/trigger-types";

export interface AgentConfigJson {
  routing: Record<string, string | { primary: string; fallback?: string }>;
  tools: string[];
  task_types: string[];
  autonomy: string;
  self_eval?: { enabled: boolean; model: string; criteria: string[]; threshold: number };
  sample_review_rate: number;
  escalation_threshold: number;
  max_iterations?: number;
  has_veto?: boolean;
  budget_limit_sek?: number;
  score_threshold_mql?: number;
  triggers?: TriggerConfig[];
  _yaml_triggers?: TriggerConfig[];
  _manifest_version: string;
  _admin_overrides?: string[];
}

export function extractConfigJson(manifest: AgentManifest): AgentConfigJson {
  const taskContextKeys = Object.keys(manifest.task_context);
  const routingKeys = Object.keys(manifest.routing).filter((k) => k !== "default");
  const taskTypes = [...new Set([...taskContextKeys, ...routingKeys])];

  const config: AgentConfigJson = {
    routing: manifest.routing,
    tools: manifest.tools,
    task_types: taskTypes,
    autonomy: manifest.autonomy,
    sample_review_rate: manifest.sample_review_rate,
    escalation_threshold: manifest.escalation_threshold,
    _manifest_version: manifest.version,
  };

  if (manifest.self_eval) config.self_eval = manifest.self_eval;
  if (manifest.max_iterations != null) config.max_iterations = manifest.max_iterations;
  if (manifest.has_veto != null) config.has_veto = manifest.has_veto;
  if (manifest.budget_limit_sek != null) config.budget_limit_sek = manifest.budget_limit_sek;
  if (manifest.score_threshold_mql != null) config.score_threshold_mql = manifest.score_threshold_mql;

  const yamlTriggers = manifest.triggers ?? [];
  config.triggers = yamlTriggers;
  config._yaml_triggers = yamlTriggers;

  return config;
}

export function mergeConfigJson(
  manifestConfig: AgentConfigJson,
  existing: Record<string, unknown> | null,
): AgentConfigJson {
  if (!existing || Object.keys(existing).length === 0) {
    return manifestConfig;
  }

  const adminOverrides = (existing._admin_overrides as string[]) ?? [];
  const merged: Record<string, unknown> = { ...manifestConfig };

  for (const key of adminOverrides) {
    if (key in existing) {
      merged[key] = existing[key];
    }
  }

  // Always overwrite _yaml_triggers with latest YAML (for dashboard diff)
  merged._yaml_triggers = manifestConfig._yaml_triggers;

  // Preserve the admin overrides list
  if (adminOverrides.length > 0) {
    merged._admin_overrides = adminOverrides;
  }

  return merged as unknown as AgentConfigJson;
}

export async function syncAgentManifests(supabase: SupabaseClient, config: AppConfig, logger: Logger): Promise<void> {
  const slugs = getAllAgentSlugs();
  let synced = 0;
  let failed = 0;

  for (const slug of slugs) {
    try {
      const manifest = loadAgentManifest(config.knowledgeDir, slug);
      const manifestConfig = extractConfigJson(manifest);

      const { data: agent, error: fetchErr } = await supabase
        .from("agents")
        .select("id, config_json")
        .eq("slug", slug)
        .single();

      if (fetchErr || !agent) {
        // Agent not in Supabase — insert
        const { error: insertErr } = await supabase.from("agents").insert({
          name: manifest.name,
          slug: manifest.slug,
          status: "idle",
          autonomy_level: manifest.autonomy,
          config_json: manifestConfig,
        });

        if (insertErr) {
          logger.warn(`Failed to insert agent "${slug}": ${insertErr.message}`, {
            agent: slug,
            action: "manifest_sync_insert_error",
          });
          failed++;
          continue;
        }

        logger.info(`Inserted new agent "${slug}" with config_json`, {
          agent: slug,
          action: "manifest_sync_insert",
        });
        synced++;
        continue;
      }

      const existing = agent.config_json as Record<string, unknown> | null;
      const merged = mergeConfigJson(manifestConfig, existing);

      const { error: updateErr } = await supabase.from("agents").update({ config_json: merged }).eq("id", agent.id);

      if (updateErr) {
        logger.warn(`Failed to update config_json for "${slug}": ${updateErr.message}`, {
          agent: slug,
          action: "manifest_sync_update_error",
        });
        failed++;
        continue;
      }

      synced++;
    } catch (err) {
      logger.warn(`Manifest sync failed for "${slug}": ${(err as Error).message}`, {
        agent: slug,
        action: "manifest_sync_error",
      });
      failed++;
    }
  }

  logger.info(`Agent manifest sync complete: ${synced} synced, ${failed} failed`, {
    action: "manifest_sync_complete",
    synced,
    failed,
  });
}
