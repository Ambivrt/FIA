import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { loadAgentManifest } from "./agent-loader";
import { BaseAgent } from "./base-agent";
import { ContentAgent } from "./content/content-agent";
import { BrandAgent } from "./brand/brand-agent";
import { StrategyAgent } from "./strategy/strategy-agent";
import { CampaignAgent } from "./campaign/campaign-agent";
import { SeoAgent } from "./seo/seo-agent";
import { LeadAgent } from "./lead/lead-agent";
import { AnalyticsAgent } from "./analytics/analytics-agent";
import { IntelligenceAgent } from "./intelligence/intelligence-agent";

const AGENT_CLASSES: Record<string, new (...args: ConstructorParameters<typeof BaseAgent>) => BaseAgent> = {
  content: ContentAgent,
  brand: BrandAgent,
  strategy: StrategyAgent,
  campaign: CampaignAgent,
  seo: SeoAgent,
  lead: LeadAgent,
  analytics: AnalyticsAgent,
  intelligence: IntelligenceAgent,
};

export async function createAgent(
  slug: string,
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient,
): Promise<BaseAgent> {
  const AgentClass = AGENT_CLASSES[slug];
  if (!AgentClass) {
    throw new Error(`Unknown agent slug: ${slug}. Valid: ${Object.keys(AGENT_CLASSES).join(", ")}`);
  }

  const manifest = loadAgentManifest(config.knowledgeDir, slug);

  // Apply admin overrides from Supabase config_json (dashboard edits)
  try {
    const { data: agent } = await supabase.from("agents").select("config_json").eq("slug", slug).single();

    if (agent?.config_json) {
      const cfg = agent.config_json as Record<string, unknown>;
      const overrides = (cfg._admin_overrides as string[]) ?? [];

      if (overrides.includes("routing") && cfg.routing) {
        manifest.routing = cfg.routing as typeof manifest.routing;
        logger.debug(`Applied admin routing override for ${slug}`, { action: "admin_override", field: "routing" });
      }
      if (overrides.includes("tools") && cfg.tools) {
        manifest.tools = cfg.tools as string[];
        logger.debug(`Applied admin tools override for ${slug}`, { action: "admin_override", field: "tools" });
      }
    }
  } catch {
    // Graceful degradation: use YAML manifest if Supabase fetch fails
    logger.warn(`Could not fetch admin overrides for ${slug}, using manifest defaults`, {
      action: "admin_override_fallback",
    });
  }

  return new AgentClass(config, logger, supabase, manifest);
}

export function getAllAgentSlugs(): string[] {
  return Object.keys(AGENT_CLASSES);
}
