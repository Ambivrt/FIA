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

export function createAgent(slug: string, config: AppConfig, logger: Logger, supabase: SupabaseClient): BaseAgent {
  const AgentClass = AGENT_CLASSES[slug];
  if (!AgentClass) {
    throw new Error(`Unknown agent slug: ${slug}. Valid: ${Object.keys(AGENT_CLASSES).join(", ")}`);
  }

  const manifest = loadAgentManifest(config.knowledgeDir, slug);
  return new AgentClass(config, logger, supabase, manifest);
}

export function getAllAgentSlugs(): string[] {
  return Object.keys(AGENT_CLASSES);
}
