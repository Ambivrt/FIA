import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { searchGoogle } from "../../llm/google-search";
import { createTask, updateTaskStatus, updateTaskSubStatus } from "../../supabase/task-writer";
import { logActivity } from "../../supabase/activity-writer";
import { writeMetric } from "../../supabase/metrics-writer";
import { usdToSek } from "../../llm/pricing";
import { ToolDefinition } from "../../llm/types";
import { getProfile, upsertProfile, IntelligenceProfileRow } from "../../supabase/intelligence-profiles";

/** Shape of a single search finding before scoring */
interface RawFinding {
  url: string;
  title: string;
  snippet: string;
  source: string;
  domain_slug: string;
  timestamp: string;
}

/** Scored finding after signal scoring */
interface ScoredFinding extends RawFinding {
  signal_score: number;
  domain_relevance: number;
  forefront_impact: number;
  actionability: number;
  recency_novelty: number;
}

/** Deep-analyzed finding */
interface AnalyzedFinding extends ScoredFinding {
  summary: string;
  implications: string;
  suggested_action: "brief" | "rapid_response" | "strategy_input" | "escalate";
  confidence: number;
}

/** Source history entry for dedup */
interface SourceHistoryEntry {
  url: string;
  title: string;
  domain_slug: string;
  signal_score: number;
  first_seen: string;
  reported_in: string[];
}

interface SourceHistory {
  version: string;
  dedup_window_hours: number;
  entries: SourceHistoryEntry[];
}

/** Depth level for adaptive research */
type ResearchDepth = "quick" | "standard" | "deep";

/** Output module for modular report structure */
interface OutputModule {
  type: "swot" | "timeline" | "scorecard" | "talent_matrix" | "company_profile";
  data: Record<string, unknown>;
}

/** Structured research output */
interface ResearchOutput {
  summary: string;
  findings: Array<{ title: string; detail: string; source: string; relevance: number }>;
  recommendations: string[];
  sources: string[];
  modules: OutputModule[];
  depth_used: ResearchDepth;
  publishable: boolean;
  seo_relevant: boolean;
  lead_opportunities: boolean;
  urgency_score: number;
  suggested_action: "brief" | "rapid_response" | "strategy_input" | "escalate";
}

/** Source type configuration for multi-source research */
interface SourceTypeConfig {
  provider: string;
  enabled: boolean;
  site_prefixes?: string[];
  used_by: string[];
}

/** Temporary watch domain from directed research */
interface TempWatchDomain {
  topic: string;
  keywords: string[];
  added_at: string;
  expires_at: string;
}

interface WatchDomain {
  slug: string;
  name: string;
  weight: number;
  keywords: {
    primary: string[];
    secondary?: string[];
    swedish?: string[];
  };
  entities?: Array<{ name: string; aliases: string[] }>;
  exclude?: string[];
  sources?: string[];
}

interface PinnedSource {
  url: string;
  check_frequency: string;
  keywords?: string[];
}

interface WatchDomainsConfig {
  settings: {
    max_results_per_source: number;
    dedup_window_hours: number;
    min_relevance_score: number;
    rapid_response_threshold: number;
  };
  domains: WatchDomain[];
  pinned_sources: PinnedSource[];
}

const SCORING_TOOL: ToolDefinition = {
  name: "signal_scoring",
  description: "Score search results for relevance to Forefront",
  input_schema: {
    type: "object",
    properties: {
      scores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            domain_relevance: { type: "number" },
            forefront_impact: { type: "number" },
            actionability: { type: "number" },
            recency_novelty: { type: "number" },
          },
          required: ["url", "domain_relevance", "forefront_impact", "actionability", "recency_novelty"],
        },
      },
    },
    required: ["scores"],
  },
};

const DEEP_ANALYSIS_TOOL: ToolDefinition = {
  name: "deep_analysis",
  description: "Provide deep analysis for high-relevance findings",
  input_schema: {
    type: "object",
    properties: {
      analyses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            summary: { type: "string" },
            implications: { type: "string" },
            suggested_action: {
              type: "string",
              enum: ["brief", "rapid_response", "strategy_input", "escalate"],
            },
            confidence: { type: "number" },
          },
          required: ["url", "summary", "implications", "suggested_action", "confidence"],
        },
      },
    },
    required: ["analyses"],
  },
};

const DEPTH_ASSESSMENT_TOOL: ToolDefinition = {
  name: "depth_assessment",
  description: "Assess appropriate research depth for a topic",
  input_schema: {
    type: "object",
    properties: {
      recommended_depth: { type: "string", enum: ["quick", "standard", "deep"] },
      reasoning: { type: "string" },
      estimated_searches: { type: "number" },
      existing_knowledge_score: { type: "number" },
    },
    required: ["recommended_depth", "reasoning", "estimated_searches"],
  },
};

const RESEARCH_OUTPUT_TOOL: ToolDefinition = {
  name: "research_output",
  description: "Submit structured research output with base sections and cross-agent flags",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            source: { type: "string" },
            relevance: { type: "number" },
          },
          required: ["title", "detail", "source", "relevance"],
        },
      },
      recommendations: { type: "array", items: { type: "string" } },
      sources: { type: "array", items: { type: "string" } },
      publishable: { type: "boolean" },
      seo_relevant: { type: "boolean" },
      lead_opportunities: { type: "boolean" },
      urgency_score: { type: "number" },
      suggested_action: {
        type: "string",
        enum: ["brief", "rapid_response", "strategy_input", "escalate"],
      },
    },
    required: ["summary", "findings", "recommendations", "sources", "urgency_score", "suggested_action"],
  },
};

const SWOT_MODULE_TOOL: ToolDefinition = {
  name: "swot_module",
  description: "Generate SWOT analysis module",
  input_schema: {
    type: "object",
    properties: {
      strengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      opportunities: { type: "array", items: { type: "string" } },
      threats: { type: "array", items: { type: "string" } },
    },
    required: ["strengths", "weaknesses", "opportunities", "threats"],
  },
};

const TIMELINE_MODULE_TOOL: ToolDefinition = {
  name: "timeline_module",
  description: "Generate timeline with trend direction",
  input_schema: {
    type: "object",
    properties: {
      timeline_entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            event: { type: "string" },
            significance: { type: "string" },
          },
          required: ["date", "event", "significance"],
        },
      },
      trend_direction: { type: "string", enum: ["emerging", "peaking", "declining"] },
      inflection_points: { type: "array", items: { type: "string" } },
    },
    required: ["timeline_entries", "trend_direction"],
  },
};

const SCORECARD_MODULE_TOOL: ToolDefinition = {
  name: "scorecard_module",
  description: "Generate tech evaluation scorecard",
  input_schema: {
    type: "object",
    properties: {
      criteria: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            score: { type: "number" },
            notes: { type: "string" },
          },
          required: ["name", "score", "notes"],
        },
      },
      overall_score: { type: "number" },
      verdict: { type: "string" },
    },
    required: ["criteria", "overall_score", "verdict"],
  },
};

const TALENT_MATRIX_MODULE_TOOL: ToolDefinition = {
  name: "talent_matrix_module",
  description: "Generate talent intelligence matrix",
  input_schema: {
    type: "object",
    properties: {
      roles_in_demand: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            count: { type: "number" },
            companies: { type: "array", items: { type: "string" } },
          },
          required: ["title", "count"],
        },
      },
      seniority_distribution: { type: "string" },
      skill_patterns: { type: "array", items: { type: "string" } },
      hiring_velocity: { type: "string", enum: ["increasing", "stable", "decreasing"] },
    },
    required: ["roles_in_demand", "skill_patterns", "hiring_velocity"],
  },
};

const COMPANY_PROFILE_MODULE_TOOL: ToolDefinition = {
  name: "company_profile_module",
  description: "Generate company/industry profile",
  input_schema: {
    type: "object",
    properties: {
      overview: { type: "string" },
      financials: { type: "object" },
      strategy_summary: { type: "string" },
      market_position: { type: "string" },
      risk_factors: { type: "array", items: { type: "string" } },
    },
    required: ["overview", "strategy_summary", "market_position", "risk_factors"],
  },
};

/** Research task types that use the unified research pipeline */
const RESEARCH_TYPES = [
  "directed_research",
  "competitor_deep_dive",
  "trend_analysis",
  "company_industry_analysis",
  "tech_watch",
  "talent_intel",
] as const;

/** Mapping of task type to required output module */
const TASK_MODULE_MAP: Record<string, OutputModule["type"]> = {
  competitor_deep_dive: "swot",
  trend_analysis: "timeline",
  tech_watch: "scorecard",
  talent_intel: "talent_matrix",
  company_industry_analysis: "company_profile",
};

/** Source types to use per task type */
const TASK_SOURCE_MAP: Record<string, string[]> = {
  directed_research: ["web_search"],
  competitor_deep_dive: ["web_search", "company_registers"],
  trend_analysis: ["web_search", "academic"],
  company_industry_analysis: ["web_search", "company_registers", "academic"],
  tech_watch: ["web_search"],
  talent_intel: ["web_search", "job_sites"],
};

/** Depth limits per level */
const DEPTH_LIMITS: Record<ResearchDepth, number> = {
  quick: 5,
  standard: 15,
  deep: 40,
};

// Compliance mode type imported via BaseAgent; local alias for readability
type ComplianceMode = "strict" | "balanced" | "open";

export class IntelligenceAgent extends BaseAgent {
  readonly name = "Intelligence Agent";
  readonly slug = "intelligence";

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (task.type === "morning_scan" || task.type === "midday_sweep") {
      return this.executeScan(task);
    }

    if (task.type === "weekly_intelligence") {
      return this.executeWeeklyBrief(task);
    }

    if ((RESEARCH_TYPES as readonly string[]).includes(task.type)) {
      return this.executeResearch(task);
    }

    // Fallback for unknown task types
    return super.execute(task);
  }

  private loadWatchDomains(): WatchDomainsConfig {
    const filePath = path.join(this.config.knowledgeDir, "agents", this.slug, "context", "watch-domains.yaml");
    const content = fs.readFileSync(filePath, "utf-8");
    return parseYaml(content) as WatchDomainsConfig;
  }

  private loadSourceHistory(): SourceHistory {
    const filePath = path.join(this.config.knowledgeDir, "agents", this.slug, "memory", "source-history.json");
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as SourceHistory;
    } catch {
      return { version: "1.0.0", dedup_window_hours: 72, entries: [] };
    }
  }

  private async saveSourceHistory(history: SourceHistory): Promise<void> {
    // Clean up entries older than dedup window
    const cutoff = Date.now() - history.dedup_window_hours * 60 * 60 * 1000;
    history.entries = history.entries.filter((e) => new Date(e.first_seen).getTime() > cutoff);
    await this.writeMemory("memory/source-history.json", history);
  }

  private isDuplicate(url: string, history: SourceHistory): boolean {
    const cutoff = Date.now() - history.dedup_window_hours * 60 * 60 * 1000;
    return history.entries.some((e) => e.url === url && new Date(e.first_seen).getTime() > cutoff);
  }

  private async gatherFindings(watchConfig: WatchDomainsConfig, history: SourceHistory): Promise<RawFinding[]> {
    const allFindings: RawFinding[] = [];
    const seenUrls = new Set<string>();
    const maxResults = watchConfig.settings.max_results_per_source;

    // Search each domain
    for (const domain of watchConfig.domains) {
      const keywords = [...domain.keywords.primary, ...(domain.keywords.swedish ?? [])];
      const excludeTerms = domain.exclude ?? [];

      for (const keyword of keywords) {
        try {
          let query = keyword;
          if (excludeTerms.length > 0) {
            query += " " + excludeTerms.map((t) => `-${t}`).join(" ");
          }

          const results = await searchGoogle(this.config, query, maxResults);

          for (const result of results) {
            if (seenUrls.has(result.url) || this.isDuplicate(result.url, history)) continue;
            seenUrls.add(result.url);

            allFindings.push({
              url: result.url,
              title: result.title,
              snippet: result.snippet,
              source: new URL(result.url).hostname,
              domain_slug: domain.slug,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          this.logger.warn(
            `Search failed for keyword "${keyword}" in domain ${domain.slug}: ${(err as Error).message}`,
            {
              agent: this.slug,
              action: "search_error",
              domain: domain.slug,
            },
          );
        }
      }

      // Search named entities (competitors)
      if (domain.entities) {
        for (const entity of domain.entities) {
          try {
            const results = await searchGoogle(this.config, `"${entity.name}" AI consulting`, maxResults);
            for (const result of results) {
              if (seenUrls.has(result.url) || this.isDuplicate(result.url, history)) continue;
              seenUrls.add(result.url);

              allFindings.push({
                url: result.url,
                title: result.title,
                snippet: result.snippet,
                source: new URL(result.url).hostname,
                domain_slug: domain.slug,
                timestamp: new Date().toISOString(),
              });
            }
          } catch (err) {
            this.logger.warn(`Entity search failed for "${entity.name}": ${(err as Error).message}`, {
              agent: this.slug,
              action: "search_error",
              entity: entity.name,
            });
          }
        }
      }
    }

    // Search pinned sources
    for (const pinned of watchConfig.pinned_sources) {
      const pinnedKeywords = pinned.keywords ?? ["AI", "digital transformation"];
      for (const keyword of pinnedKeywords) {
        try {
          const results = await searchGoogle(this.config, `site:${pinned.url} ${keyword}`, maxResults);
          for (const result of results) {
            if (seenUrls.has(result.url) || this.isDuplicate(result.url, history)) continue;
            seenUrls.add(result.url);

            allFindings.push({
              url: result.url,
              title: result.title,
              snippet: result.snippet,
              source: pinned.url,
              domain_slug: "pinned",
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          this.logger.warn(`Pinned source search failed for ${pinned.url}: ${(err as Error).message}`, {
            agent: this.slug,
            action: "search_error",
            source: pinned.url,
          });
        }
      }
    }

    return allFindings;
  }

  private static readonly SCORING_BATCH_SIZE = 50;

  private async scoreFindings(
    findings: RawFinding[],
    watchConfig: WatchDomainsConfig,
    mode: ComplianceMode = "strict",
    topic?: string,
  ): Promise<ScoredFinding[]> {
    if (findings.length === 0) return [];

    const scored: ScoredFinding[] = [];

    // Batch findings to avoid overwhelming the LLM with too many items
    for (let i = 0; i < findings.length; i += IntelligenceAgent.SCORING_BATCH_SIZE) {
      const batch = findings.slice(i, i + IntelligenceAgent.SCORING_BATCH_SIZE);
      const batchScored = await this.scoreBatch(batch, watchConfig, mode, topic);
      scored.push(...batchScored);
    }

    return scored.sort((a, b) => b.signal_score - a.signal_score);
  }

  private async scoreBatch(
    findings: RawFinding[],
    watchConfig: WatchDomainsConfig,
    mode: ComplianceMode = "strict",
    topic?: string,
  ): Promise<ScoredFinding[]> {
    const findingsText = findings
      .map((f, i) => `[${i}] ${f.title}\nURL: ${f.url}\nSnippet: ${f.snippet}\nDomän: ${f.domain_slug}`)
      .join("\n\n");

    const scoringPrompt = this.buildScoringPrompt(findingsText, mode, topic);

    const response = await this.callLLM("default", scoringPrompt, {
      tools: [SCORING_TOOL],
      toolChoice: { type: "tool", name: "signal_scoring" },
    });

    const scored: ScoredFinding[] = [];

    if (response.toolUse && response.toolUse.toolName === "signal_scoring") {
      const input = response.toolUse.input as Record<string, unknown>;
      const scores = Array.isArray(input?.scores)
        ? (input.scores as Array<{
            url: string;
            domain_relevance: number;
            forefront_impact: number;
            actionability: number;
            recency_novelty: number;
          }>)
        : [];

      if (scores.length === 0) {
        this.logger.warn(`Scoring batch returned no valid scores (${findings.length} findings)`, {
          agent: this.slug,
          action: "scoring_empty",
        });
        return [];
      }

      for (const score of scores) {
        const finding = findings.find((f) => f.url === score.url);
        if (!finding) continue;

        const domain = watchConfig.domains.find((d) => d.slug === finding.domain_slug);
        const domainWeight = domain?.weight ?? 0.7;

        const compositeScore =
          (score.domain_relevance * 0.35 +
            score.forefront_impact * 0.3 +
            score.actionability * 0.2 +
            score.recency_novelty * 0.15) *
          domainWeight;

        const thresholds = this.getThresholds(mode);
        if (compositeScore >= thresholds.minScore) {
          scored.push({
            ...finding,
            signal_score: compositeScore,
            domain_relevance: score.domain_relevance,
            forefront_impact: score.forefront_impact,
            actionability: score.actionability,
            recency_novelty: score.recency_novelty,
          });
        }
      }
    }

    return scored;
  }

  private async deepAnalyze(
    findings: ScoredFinding[],
    mode: ComplianceMode = "strict",
    topic?: string,
  ): Promise<AnalyzedFinding[]> {
    const thresholds = this.getThresholds(mode);
    const highRelevance = findings.filter((f) => f.signal_score >= thresholds.deepAnalysisScore);
    if (highRelevance.length === 0) return [];

    const findingsText = highRelevance
      .map(
        (f, i) =>
          `[${i}] ${f.title} (score: ${f.signal_score.toFixed(2)})\nURL: ${f.url}\nSnippet: ${f.snippet}\nDomän: ${f.domain_slug}`,
      )
      .join("\n\n");

    const analysisPrompt = this.buildDeepAnalysisPrompt(findingsText, mode, topic);

    const response = await this.callLLM("deep_analysis", analysisPrompt, {
      tools: [DEEP_ANALYSIS_TOOL],
      toolChoice: { type: "tool", name: "deep_analysis" },
    });

    const analyzed: AnalyzedFinding[] = [];

    if (response.toolUse && response.toolUse.toolName === "deep_analysis") {
      const { analyses } = response.toolUse.input as {
        analyses: Array<{
          url: string;
          summary: string;
          implications: string;
          suggested_action: "brief" | "rapid_response" | "strategy_input" | "escalate";
          confidence: number;
        }>;
      };

      for (const analysis of analyses) {
        const finding = highRelevance.find((f) => f.url === analysis.url);
        if (!finding) continue;

        analyzed.push({
          ...finding,
          summary: analysis.summary,
          implications: analysis.implications,
          suggested_action: analysis.suggested_action,
          confidence: analysis.confidence,
        });
      }
    }

    return analyzed;
  }

  private async handleRapidResponses(analyzed: AnalyzedFinding[], taskId: string): Promise<number> {
    let triggered = 0;

    for (const finding of analyzed) {
      if (finding.suggested_action === "escalate") {
        // Send Slack notification to orchestrator
        try {
          const { getSlackApp } = await import("../../slack/app");
          const { sendEscalation } = await import("../../slack/handlers");
          const slackApp = getSlackApp();
          if (slackApp) {
            await sendEscalation(
              slackApp,
              this.logger,
              this.slug,
              taskId,
              `Omvärldsbevakning eskalering:\n${finding.title}\n${finding.summary}\nKälla: ${finding.url}`,
            );
          }
        } catch (err) {
          this.logger.warn(`Failed to send escalation: ${(err as Error).message}`, {
            agent: this.slug,
            action: "escalation_error",
          });
        }
      }

      if (finding.suggested_action === "rapid_response") {
        try {
          // Create a task for Content Agent
          const { data: contentAgent } = await this.supabase.from("agents").select("id").eq("slug", "content").single();

          if (contentAgent) {
            const rapidTaskId = await createTask(this.supabase, {
              agent_id: contentAgent.id,
              type: "rapid_response",
              title: `Rapid Response: ${finding.title}`,
              priority: "high",
              content_json: {
                content_type: "rapid_response_brief",
                trigger_finding: {
                  url: finding.url,
                  title: finding.title,
                  summary: finding.summary,
                  implications: finding.implications,
                  signal_score: finding.signal_score,
                },
                intelligence_task_id: taskId,
              },
              source: "intelligence",
            });

            this.logger.info(`Rapid response task created: ${rapidTaskId}`, {
              agent: this.slug,
              action: "rapid_response_created",
              task_id: rapidTaskId,
              trigger_url: finding.url,
            });

            triggered++;
          }
        } catch (err) {
          this.logger.warn(`Failed to create rapid response task: ${(err as Error).message}`, {
            agent: this.slug,
            action: "rapid_response_error",
          });
        }
      }
    }

    return triggered;
  }

  private async executeScan(task: AgentTask): Promise<AgentResult> {
    const agentRow = await this.getAgentId();
    const taskId = task.existingTaskId
      ? task.existingTaskId
      : await createTask(this.supabase, {
          agent_id: agentRow,
          type: task.type,
          title: task.title,
          priority: task.priority ?? "normal",
          source: "gateway",
        });

    await updateTaskStatus(this.supabase, taskId, "in_progress");

    const scanType = task.type === "morning_scan" ? "Morgon" : "Middag";

    try {
      await task.onProgress?.("scanning", `:mag: Intelligence Agent startar ${scanType.toLowerCase()}sscan...`, {
        task_id: taskId,
      });

      // Step 1: Load config and history + merge temp watch domains
      const watchConfig = this.loadWatchDomains();
      this.mergeTempWatchDomains(watchConfig);
      const history = this.loadSourceHistory();

      // Step 2: Gather findings via Serper
      await task.onProgress?.(
        "searching",
        `:globe_with_meridians: Söker ${watchConfig.domains.length} domäner + ${watchConfig.pinned_sources.length} fasta källor...`,
        {
          task_id: taskId,
        },
      );

      const findings = await this.gatherFindings(watchConfig, history);
      const totalSearches =
        watchConfig.domains.reduce(
          (acc, d) => acc + d.keywords.primary.length + (d.keywords.swedish?.length ?? 0) + (d.entities?.length ?? 0),
          0,
        ) + watchConfig.pinned_sources.reduce((acc, p) => acc + (p.keywords?.length ?? 2), 0);

      this.logger.info(`Gathered ${findings.length} unique findings from ${totalSearches} searches`, {
        agent: this.slug,
        action: "findings_gathered",
        task_id: taskId,
        total_findings: findings.length,
        total_searches: totalSearches,
      });

      // Step 3: Signal scoring (Sonnet)
      await task.onProgress?.("scoring", `:brain: Scorar ${findings.length} fynd...`, {
        task_id: taskId,
      });

      const scored = await this.scoreFindings(findings, watchConfig);

      // Step 4: Deep analysis (Opus) for high-relevance findings
      const highRelevance = scored.filter((f) => f.signal_score >= 0.7);
      let analyzed: AnalyzedFinding[] = [];

      if (highRelevance.length > 0) {
        await task.onProgress?.(
          "analyzing",
          `:microscope: Djupanalyserar ${highRelevance.length} högrelevanta fynd...`,
          {
            task_id: taskId,
          },
        );

        analyzed = await this.deepAnalyze(scored);
      }

      // Step 5: Handle rapid responses and escalations
      const rapidResponseCount = await this.handleRapidResponses(analyzed, taskId);

      // Step 6: Generate briefing via LLM
      await task.onProgress?.("briefing", `:memo: Genererar brief...`, { task_id: taskId });

      const briefingPrompt = this.buildBriefingPrompt(scored, analyzed, scanType, totalSearches, findings.length);
      const briefResponse = await this.callLLM("default", briefingPrompt);

      // Step 7: Update source history
      for (const finding of scored) {
        const existing = history.entries.find((e) => e.url === finding.url);
        if (existing) {
          existing.reported_in.push(taskId);
        } else {
          history.entries.push({
            url: finding.url,
            title: finding.title,
            domain_slug: finding.domain_slug,
            signal_score: finding.signal_score,
            first_seen: finding.timestamp,
            reported_in: [taskId],
          });
        }
      }
      await this.saveSourceHistory(history);

      // Step 8: Calculate cost
      const searchCostSek = totalSearches * 0.01; // ~0.001 USD per search ≈ 0.01 SEK

      // Step 9: Build content_json (with enrichment: research suggestions)
      const suggestedResearch = this.suggestResearchTopics(scored);
      const today = new Date().toISOString().split("T")[0];
      const contentJson = {
        content_type: "intelligence_brief",
        title: `Omvärldsbevakning ${today} – ${scanType}`,
        body: briefResponse.text,
        summary: `${scored.length} fynd, ${highRelevance.length} högrelevanta, ${rapidResponseCount} rapid responses`,
        suggested_research_topics: suggestedResearch,
        metadata: {
          scan_type: task.type,
          total_searches: totalSearches,
          total_results: findings.length,
          filtered_results: scored.length,
          high_relevance_count: highRelevance.length,
          rapid_responses_triggered: rapidResponseCount,
          search_cost_sek: searchCostSek,
        },
      };

      await updateTaskStatus(this.supabase, taskId, "published", {
        content_json: contentJson,
        model_used: "claude-sonnet + claude-opus",
        cost_sek: searchCostSek,
      });

      await logActivity(this.supabase, {
        agent_id: agentRow,
        action: "scan_completed",
        details_json: {
          task_id: taskId,
          type: task.type,
          findings: scored.length,
          high_relevance: highRelevance.length,
          rapid_responses: rapidResponseCount,
        },
      });

      // Write cost metric
      try {
        await writeMetric(this.supabase, {
          category: "cost",
          metric_name: "agent_cost_intelligence",
          value: searchCostSek,
          period: "daily",
          period_start: today,
          metadata_json: { task_id: taskId, scan_type: task.type, searches: totalSearches },
        });
      } catch {
        // Non-fatal
      }

      await task.onProgress?.(
        "complete",
        `:white_check_mark: ${scanType}sscan klar: ${scored.length} fynd, ${highRelevance.length} högrelevanta`,
        { task_id: taskId },
      );

      return {
        taskId,
        output: briefResponse.text,
        model: briefResponse.model,
        tokensIn: briefResponse.tokensIn,
        tokensOut: briefResponse.tokensOut,
        durationMs: briefResponse.durationMs,
        status: "completed",
      };
    } catch (err) {
      const message = (err as Error).message;

      try {
        await updateTaskStatus(this.supabase, taskId, "error", {
          content_json: { error: message },
        });
        await logActivity(this.supabase, {
          agent_id: agentRow,
          action: "scan_error",
          details_json: { task_id: taskId, error: message },
        });
      } catch {
        // Best-effort error logging
      }

      this.logger.error(`Intelligence scan failed: ${message}`, {
        agent: this.slug,
        task_id: taskId,
        action: "scan_error",
        status: "error",
      });

      await task.onProgress?.("error", `:x: ${scanType}sscan misslyckades: ${message}`, {
        task_id: taskId,
      });

      return {
        taskId,
        output: "",
        model: "",
        tokensIn: 0,
        tokensOut: 0,
        durationMs: 0,
        status: "error",
      };
    }
  }

  private async executeWeeklyBrief(task: AgentTask): Promise<AgentResult> {
    const agentRow = await this.getAgentId();
    const taskId = task.existingTaskId
      ? task.existingTaskId
      : await createTask(this.supabase, {
          agent_id: agentRow,
          type: task.type,
          title: task.title,
          priority: task.priority ?? "normal",
          source: "gateway",
        });

    await updateTaskStatus(this.supabase, taskId, "in_progress");

    try {
      await task.onProgress?.("compiling", `:books: Sammanställer veckobriefing...`, {
        task_id: taskId,
      });

      // Fetch this week's scan tasks from Supabase
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: weekTasks } = await this.supabase
        .from("tasks")
        .select("content_json, type, created_at")
        .eq("agent_id", agentRow)
        .in("type", ["morning_scan", "midday_sweep"])
        .gte("created_at", weekAgo)
        .eq("status", "published")
        .order("created_at", { ascending: true });

      // Load source history for trend analysis
      const history = this.loadSourceHistory();
      const watchConfig = this.loadWatchDomains();

      // Build weekly context for LLM
      const weeklyContext = (weekTasks ?? [])
        .map((t: { content_json: unknown; type: string; created_at: string }) => {
          const cj = t.content_json as Record<string, unknown> | null;
          return cj?.body ?? cj?.summary ?? "Ingen data";
        })
        .join("\n\n---\n\n");

      const domainList = watchConfig.domains.map((d) => `- ${d.name} (${d.slug})`).join("\n");
      const competitorList =
        watchConfig.domains
          .find((d) => d.slug === "competitors")
          ?.entities?.map((e) => e.name)
          .join(", ") ?? "Inga";

      const weekNumber = this.getWeekNumber(new Date());
      const year = new Date().getFullYear();

      const weeklyPrompt = [
        `Sammanställ en veckobriefing (vecka ${weekNumber}, ${year}) för Forefront Consulting Group.`,
        "",
        "## Bevakningsdomäner",
        domainList,
        "",
        "## Namngivna konkurrenter",
        competitorList,
        "",
        `## Antal fynd i source-history: ${history.entries.length}`,
        `## Antal avslutade scans denna vecka: ${weekTasks?.length ?? 0}`,
        "",
        "## Veckans scanrapporter",
        weeklyContext || "Inga scanrapporter denna vecka.",
        "",
        "Generera en strukturerad veckobriefing med:",
        "1. Veckans viktigaste (top 5)",
        "2. Per domän (2–3 viktigaste)",
        "3. Konkurrentöversikt",
        "4. Trender",
        "5. Rekommendationer (2–3 konkreta förslag)",
      ].join("\n");

      const response = await this.callLLM("deep_analysis", weeklyPrompt);

      const contentJson = {
        content_type: "intelligence_brief",
        title: `Veckobriefing ${year}-W${String(weekNumber).padStart(2, "0")}`,
        body: response.text,
        summary: `Veckobriefing baserad på ${weekTasks?.length ?? 0} scans, ${history.entries.length} unika fynd`,
        metadata: {
          scan_type: "weekly_intelligence",
          period: `${year}-W${String(weekNumber).padStart(2, "0")}`,
          total_findings_week: history.entries.filter(
            (e) => new Date(e.first_seen).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).length,
          high_relevance_count: history.entries.filter(
            (e) => e.signal_score >= 0.7 && new Date(e.first_seen).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).length,
          domains_covered: watchConfig.domains.map((d) => d.slug),
        },
      };

      const costSek = usdToSek(response.costUsd, this.config.usdToSek);

      await updateTaskStatus(this.supabase, taskId, "published", {
        content_json: contentJson,
        model_used: response.model,
        tokens_used: response.tokensIn + response.tokensOut,
        cost_sek: costSek,
      });

      await logActivity(this.supabase, {
        agent_id: agentRow,
        action: "weekly_brief_completed",
        details_json: { task_id: taskId, scans_included: weekTasks?.length ?? 0 },
      });

      await task.onProgress?.("complete", `:white_check_mark: Veckobriefing klar`, {
        task_id: taskId,
      });

      return {
        taskId,
        output: response.text,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        durationMs: response.durationMs,
        status: "completed",
      };
    } catch (err) {
      const message = (err as Error).message;

      try {
        await updateTaskStatus(this.supabase, taskId, "error", {
          content_json: { error: message },
        });
        await logActivity(this.supabase, {
          agent_id: agentRow,
          action: "weekly_brief_error",
          details_json: { task_id: taskId, error: message },
        });
      } catch {
        // Best-effort
      }

      this.logger.error(`Weekly brief failed: ${message}`, {
        agent: this.slug,
        task_id: taskId,
        action: "weekly_brief_error",
      });

      return {
        taskId,
        output: "",
        model: "",
        tokensIn: 0,
        tokensOut: 0,
        durationMs: 0,
        status: "error",
      };
    }
  }

  private buildBriefingPrompt(
    scored: ScoredFinding[],
    analyzed: AnalyzedFinding[],
    scanType: string,
    totalSearches: number,
    totalResults: number,
  ): string {
    const topFindings = analyzed
      .map(
        (f) =>
          `### ${f.title} (score: ${f.signal_score.toFixed(2)})\n` +
          `**Källa:** ${f.url}\n` +
          `**Sammanfattning:** ${f.summary}\n` +
          `**Implications:** ${f.implications}\n` +
          `**Föreslagen åtgärd:** ${f.suggested_action}\n` +
          `**Konfidens:** ${f.confidence}`,
      )
      .join("\n\n");

    const radarFindings = scored
      .filter((f) => f.signal_score >= 0.6 && f.signal_score < 0.7)
      .map((f) => `- **${f.title}** (${f.signal_score.toFixed(2)}) – ${f.snippet.slice(0, 120)}`)
      .join("\n");

    return [
      `Generera en ${scanType.toLowerCase()}sscan-rapport för Forefront Consulting Group.`,
      "",
      "## Format",
      "1. Sammanfattning (3–5 rader)",
      "2. Toppfynd (score >= 0.7) med full analys",
      "3. Bevakningsradar (score 0.6–0.69)",
      "4. Statistik",
      "",
      "## Toppfynd",
      topFindings || "Inga högrelevanta fynd denna scan.",
      "",
      "## Bevakningsradar",
      radarFindings || "Inga fynd i radar-intervallet.",
      "",
      "## Statistik",
      `- Sökningar: ${totalSearches}`,
      `- Resultat: ${totalResults}`,
      `- Filtrerade (score >= 0.6): ${scored.length}`,
      `- Högrelevanta (score >= 0.7): ${analyzed.length}`,
      "",
      "Skriv rapporten som markdown. Tonalitet: analytiker till beslutsfattare. Kort, konkret, utan fluff.",
    ].join("\n");
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  // ──────────────────────────────────────────────────────────────────
  // RESEARCH PIPELINE — 6 new job types
  // ──────────────────────────────────────────────────────────────────

  private async executeResearch(task: AgentTask): Promise<AgentResult> {
    const agentRow = await this.getAgentId();
    const taskId = task.existingTaskId
      ? task.existingTaskId
      : await createTask(this.supabase, {
          agent_id: agentRow,
          type: task.type,
          title: task.title,
          priority: task.priority ?? "normal",
          source: "gateway",
        });

    await updateTaskStatus(this.supabase, taskId, "in_progress");

    try {
      // Step 0: Resolve relevance mode
      const mode = this.resolveComplianceMode(task);

      // Step 1: Assess depth
      await this.safeSubStatus(taskId, "gathering");
      await task.onProgress?.("depth", `:brain: Bedömer researchdjup...`, { task_id: taskId });

      const depth = await this.assessDepth(task);
      const maxSearches = DEPTH_LIMITS[depth];

      this.logger.info(`Research depth assessed: ${depth}, mode: ${mode}`, {
        agent: this.slug,
        action: "depth_assessed",
        task_id: taskId,
        depth,
        compliance_mode: mode,
        task_type: task.type,
      });

      // Step 2: Load intelligence profile for context
      const topicSlug = this.slugifyTopic(task.title);
      const existingProfile = await this.loadIntelligenceProfile(topicSlug);

      // Step 3: Gather findings
      await task.onProgress?.("gathering", `:mag: Samlar data (${depth}, max ${maxSearches} sökningar)...`, {
        task_id: taskId,
      });

      const findings = await this.gatherResearchFindings(task.input, task.type, depth, existingProfile, mode);

      if (findings.length === 0) {
        this.logger.warn("Research gathering returned 0 findings – check SERPER_API_KEY and network", {
          agent: this.slug,
          action: "research_no_findings",
          task_id: taskId,
          task_type: task.type,
          topic: task.input,
        });
      } else {
        this.logger.info(`Research gathered ${findings.length} findings`, {
          agent: this.slug,
          action: "research_gathered",
          task_id: taskId,
          findings_count: findings.length,
          depth,
        });
      }

      // Step 4: Checkpoint for deep research
      if (depth === "deep") {
        await this.safeSubStatus(taskId, "awaiting_input");
        await task.onProgress?.(
          "checkpoint",
          `:pause_button: ${findings.length} fynd insamlade. Checkpoint: djupanalys påbörjas.`,
          { task_id: taskId },
        );
        // In production, this would pause and wait for user confirmation.
        // For now, we continue automatically but log the checkpoint.
        this.logger.info(`Deep research checkpoint: ${findings.length} findings gathered`, {
          agent: this.slug,
          action: "research_checkpoint",
          task_id: taskId,
        });
      }

      // Step 5: Analyze findings
      await this.safeSubStatus(taskId, "analyzing");
      await task.onProgress?.("analyzing", `:microscope: Analyserar ${findings.length} fynd...`, {
        task_id: taskId,
      });

      const profileContext = existingProfile
        ? `Befintlig kunskap: ${existingProfile.summary}\nTidigare undersökningar: ${existingProfile.research_count}`
        : "";

      const analyzed = await this.analyzeResearchFindings(findings, task.type, depth, profileContext, mode, task.input);

      // Step 6: Compile output with modules
      await this.safeSubStatus(taskId, "compiling");
      await task.onProgress?.("compiling", `:memo: Sammanställer rapport...`, { task_id: taskId });

      const output = await this.compileResearchOutput(task.type, task.input, analyzed, depth, existingProfile, mode);

      // Step 7: Update intelligence profile
      const category = this.inferProfileCategory(task.type);
      await this.upsertIntelligenceProfile(topicSlug, task.title, category, output, analyzed);

      // Step 8: Add temp watch domain for enrichment
      if (output.urgency_score >= 0.5) {
        const keywords = output.findings.slice(0, 3).map((f) => f.title);
        await this.addTemporaryWatchDomain(task.title, keywords);
      }

      // Step 9: Calculate cost
      const totalSearches = findings.length; // Approximate: each finding = ~1 search
      const searchCostSek = totalSearches * 0.01;

      // Step 10: Build content_json
      const contentJson = {
        content_type: "intelligence_research",
        title: output.summary.slice(0, 100),
        body: this.formatResearchBody(output),
        summary: output.summary,
        findings: output.findings,
        recommendations: output.recommendations,
        sources: output.sources,
        modules: output.modules.map((m) => m.type),
        module_data: Object.fromEntries(output.modules.map((m) => [m.type, m.data])),
        depth_used: depth,
        publishable: output.publishable,
        seo_relevant: output.seo_relevant,
        lead_opportunities: output.lead_opportunities,
        urgency_score: output.urgency_score,
        suggested_action: output.suggested_action,
        profile_id: topicSlug,
        metadata: {
          task_type: task.type,
          total_searches: totalSearches,
          depth,
          compliance_mode: mode,
          search_cost_sek: searchCostSek,
        },
      };

      const costSek = searchCostSek;

      await updateTaskStatus(this.supabase, taskId, "completed", {
        content_json: contentJson,
        model_used: depth === "quick" ? "claude-sonnet" : "claude-sonnet + claude-opus",
        cost_sek: costSek,
        sub_status: null,
      });

      await logActivity(this.supabase, {
        agent_id: agentRow,
        action: "research_completed",
        details_json: {
          task_id: taskId,
          type: task.type,
          depth,
          findings: analyzed.length,
          modules: output.modules.map((m) => m.type),
          publishable: output.publishable,
          urgency_score: output.urgency_score,
        },
      });

      try {
        await writeMetric(this.supabase, {
          category: "cost",
          metric_name: "agent_cost_intelligence",
          value: costSek,
          period: "daily",
          period_start: new Date().toISOString().split("T")[0],
          metadata_json: { task_id: taskId, task_type: task.type, depth, searches: totalSearches },
        });
      } catch {
        // Non-fatal
      }

      await task.onProgress?.(
        "complete",
        `:white_check_mark: Research klar (${depth}): ${analyzed.length} fynd, ${output.modules.length} moduler`,
        { task_id: taskId },
      );

      return {
        taskId,
        output: this.formatResearchBody(output),
        model: depth === "quick" ? "claude-sonnet" : "claude-opus",
        tokensIn: 0,
        tokensOut: 0,
        durationMs: 0,
        status: "completed",
      };
    } catch (err) {
      const message = (err as Error).message;

      try {
        await updateTaskStatus(this.supabase, taskId, "error", {
          content_json: { error: message },
          sub_status: null,
        });
        await logActivity(this.supabase, {
          agent_id: agentRow,
          action: "research_error",
          details_json: { task_id: taskId, error: message },
        });
      } catch {
        // Best-effort
      }

      this.logger.error(`Research failed: ${message}`, {
        agent: this.slug,
        task_id: taskId,
        action: "research_error",
        status: "error",
      });

      await task.onProgress?.("error", `:x: Research misslyckades: ${message}`, { task_id: taskId });

      return {
        taskId,
        output: "",
        model: "",
        tokensIn: 0,
        tokensOut: 0,
        durationMs: 0,
        status: "error",
      };
    }
  }

  // ── Depth Assessment ────────────────────────────────────────────

  private preAssessDepth(task: AgentTask): ResearchDepth | null {
    const contentJson = (task as unknown as { content_json?: Record<string, unknown> }).content_json;
    const hint = contentJson?.depth_hint as string | undefined;
    if (hint && ["quick", "standard", "deep"].includes(hint)) return hint as ResearchDepth;

    const sourceChannel = contentJson?.source_channel as string | undefined;
    if (sourceChannel === "slack" && !hint) return "quick";

    if (task.priority === "urgent" || task.priority === "high") return "standard";

    return null;
  }

  private async assessDepth(task: AgentTask): Promise<ResearchDepth> {
    const preAssessed = this.preAssessDepth(task);
    if (preAssessed) return preAssessed;

    const topicSlug = this.slugifyTopic(task.title);
    const profile = await this.loadIntelligenceProfile(topicSlug);

    const prompt = [
      "Bedöm lämpligt djup för denna research-uppgift.",
      `Ämne: ${task.title}`,
      `Beskrivning: ${task.input}`,
      `Typ: ${task.type}`,
      `Prioritet: ${task.priority ?? "normal"}`,
      profile
        ? `Befintlig profil: ${profile.summary} (${profile.research_count} tidigare undersökningar)`
        : "Ingen befintlig profil.",
      "",
      "Djupnivåer:",
      "- quick: Enkel fråga, befintlig kunskap, max 5 sökningar, koncis output",
      "- standard: Medelkomplext, 10-15 sökningar, strukturerad rapport",
      "- deep: Komplext, 30-40 sökningar, komplett rapport, checkpoint efter insamling",
    ].join("\n");

    const response = await this.callLLM("quick", prompt, {
      tools: [DEPTH_ASSESSMENT_TOOL],
      toolChoice: { type: "tool", name: "depth_assessment" },
    });

    if (response.toolUse?.toolName === "depth_assessment") {
      const input = response.toolUse.input as { recommended_depth: string };
      if (["quick", "standard", "deep"].includes(input.recommended_depth)) {
        return input.recommended_depth as ResearchDepth;
      }
    }

    return "standard";
  }

  // ── Research Gathering ──────────────────────────────────────────

  private async gatherResearchFindings(
    topic: string,
    taskType: string,
    depth: ResearchDepth,
    profile: IntelligenceProfileRow | null,
    mode: ComplianceMode = "strict",
  ): Promise<RawFinding[]> {
    const allFindings: RawFinding[] = [];
    const seenUrls = new Set<string>();
    const history = this.loadSourceHistory();
    const maxSearches = DEPTH_LIMITS[depth];
    let searchCount = 0;

    const sourceTypes = TASK_SOURCE_MAP[taskType] ?? ["web_search"];

    // Load source-types config for site prefixes
    const sourceConfig = this.loadSourceTypesConfig();

    // Build search queries based on topic
    const baseQueries = this.buildSearchQueries(topic, taskType, profile, mode);

    for (const query of baseQueries) {
      if (searchCount >= maxSearches) break;

      // Web search (always first)
      if (sourceTypes.includes("web_search")) {
        try {
          const results = await searchGoogle(this.config, query, 10);
          searchCount++;

          for (const result of results) {
            if (seenUrls.has(result.url) || this.isDuplicate(result.url, history)) continue;
            seenUrls.add(result.url);
            allFindings.push({
              url: result.url,
              title: result.title,
              snippet: result.snippet,
              source: new URL(result.url).hostname,
              domain_slug: taskType,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          this.logger.warn(`Research search failed for "${query}": ${(err as Error).message}`, {
            agent: this.slug,
            action: "research_search_error",
          });
        }
      }

      // Site-specific sources (job_sites, academic, company_registers)
      for (const sourceType of sourceTypes) {
        if (sourceType === "web_search" || searchCount >= maxSearches) continue;

        const config = sourceConfig[sourceType];
        if (!config?.site_prefixes) continue;

        for (const prefix of config.site_prefixes) {
          if (searchCount >= maxSearches) break;

          try {
            const results = await searchGoogle(this.config, `${prefix} ${query}`, 5);
            searchCount++;

            for (const result of results) {
              if (seenUrls.has(result.url) || this.isDuplicate(result.url, history)) continue;
              seenUrls.add(result.url);
              allFindings.push({
                url: result.url,
                title: result.title,
                snippet: result.snippet,
                source: new URL(result.url).hostname,
                domain_slug: `${taskType}:${sourceType}`,
                timestamp: new Date().toISOString(),
              });
            }
          } catch (err) {
            this.logger.warn(`Source search failed (${sourceType}): ${(err as Error).message}`, {
              agent: this.slug,
              action: "source_search_error",
              source_type: sourceType,
            });
          }
        }
      }
    }

    return allFindings;
  }

  private buildSearchQueries(
    topic: string,
    taskType: string,
    profile: IntelligenceProfileRow | null,
    mode: ComplianceMode = "strict",
  ): string[] {
    const queries: string[] = [topic];

    switch (taskType) {
      case "competitor_deep_dive":
        queries.push(
          `"${topic}" AI strategy`,
          `"${topic}" digital transformation`,
          `"${topic}" revenue employees`,
          `"${topic}" partnerships acquisitions`,
          `"${topic}" job openings AI`,
        );
        break;
      case "trend_analysis":
        queries.push(
          `${topic} trend 2025 2026`,
          `${topic} market growth`,
          `${topic} forecast prediction`,
          `${topic} emerging technology`,
        );
        break;
      case "company_industry_analysis":
        queries.push(
          `"${topic}" market size`,
          `"${topic}" key players`,
          `"${topic}" annual report`,
          `"${topic}" SWOT analysis`,
        );
        break;
      case "tech_watch":
        queries.push(
          `${topic} review comparison`,
          `${topic} pricing enterprise`,
          `${topic} alternatives`,
          `${topic} API integration`,
        );
        break;
      case "talent_intel":
        queries.push(
          `"${topic}" job openings`,
          `"${topic}" hiring AI engineer`,
          `"${topic}" recruitment trends`,
          `"${topic}" salary compensation`,
        );
        break;
      default: // directed_research
        if (mode === "strict") {
          queries.push(`${topic} Forefront consulting`, `${topic} Nordic market`, `${topic} latest news`);
        } else {
          queries.push(`${topic} latest news`, `${topic} market overview`, `${topic} analysis`);
        }
        break;
    }

    // Add profile-informed queries
    if (profile?.key_facts) {
      const facts = Object.keys(profile.key_facts).slice(0, 2);
      for (const fact of facts) {
        queries.push(`${topic} ${fact}`);
      }
    }

    return queries;
  }

  private loadSourceTypesConfig(): Record<string, SourceTypeConfig> {
    try {
      const filePath = path.join(this.config.knowledgeDir, "agents", this.slug, "context", "source-types.yaml");
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = parseYaml(content) as { source_types: Record<string, SourceTypeConfig> };
      return parsed.source_types ?? {};
    } catch {
      return {};
    }
  }

  // ── Research Analysis ───────────────────────────────────────────

  private async analyzeResearchFindings(
    findings: RawFinding[],
    taskType: string,
    depth: ResearchDepth,
    context: string,
    mode: ComplianceMode = "strict",
    topic?: string,
  ): Promise<AnalyzedFinding[]> {
    if (findings.length === 0) return [];

    // For quick: skip deep analysis, just score with Sonnet
    if (depth === "quick") {
      const scored = await this.scoreFindings(findings, this.loadWatchDomains(), mode, topic);
      return scored.map((f) => ({
        ...f,
        summary: f.snippet,
        implications: "",
        suggested_action: "brief" as const,
        confidence: f.signal_score,
      }));
    }

    // For standard/deep: score first, then deep analyze
    const scored = await this.scoreFindings(findings, this.loadWatchDomains(), mode, topic);
    const thresholds = this.getThresholds(mode);
    const toAnalyze = depth === "deep" ? scored : scored.filter((f) => f.signal_score >= thresholds.deepAnalysisScore);

    if (toAnalyze.length === 0) {
      return scored.map((f) => ({
        ...f,
        summary: f.snippet,
        implications: "",
        suggested_action: "brief" as const,
        confidence: f.signal_score,
      }));
    }

    return this.deepAnalyze(toAnalyze, mode, topic);
  }

  // ── Research Output Compilation ─────────────────────────────────

  private async compileResearchOutput(
    taskType: string,
    topic: string,
    findings: AnalyzedFinding[],
    depth: ResearchDepth,
    profile: IntelligenceProfileRow | null,
    mode: ComplianceMode = "strict",
  ): Promise<ResearchOutput> {
    // Build base output via LLM
    const findingsText = findings
      .map(
        (f, i) =>
          `[${i}] ${f.title} (score: ${f.signal_score.toFixed(2)})\n` +
          `URL: ${f.url}\n` +
          `Sammanfattning: ${f.summary}\n` +
          `Implikationer: ${f.implications}`,
      )
      .join("\n\n");

    const profileContext = profile
      ? `\nBefintlig profil: ${profile.summary}\nTidigare undersökningar: ${profile.research_count}`
      : "";

    const recipient = mode === "strict" ? "för Forefront Consulting Group" : `om "${topic}"`;
    const compilePrompt = [
      `Sammanställ en ${taskType.replace(/_/g, " ")}-rapport ${recipient}.`,
      `Ämne: ${topic}`,
      `Djup: ${depth}`,
      profileContext,
      "",
      "Baserat på följande fynd, leverera en strukturerad research-output.",
      "Bedöm om resultaten är publicerbara, SEO-relevanta, eller innehåller lead-möjligheter.",
      "Bedöm urgency (0.0 = informativt, 1.0 = kräver omedelbar handling).",
      "Välj suggested_action: brief (default), rapid_response, strategy_input, eller escalate.",
      "",
      "--- FYND ---",
      findingsText || "Inga fynd att analysera.",
      "",
      "Skriv på svenska. Tonalitet: analytiker till beslutsfattare.",
    ].join("\n");

    const response = await this.callLLM(depth === "quick" ? "quick" : "standard_analysis", compilePrompt, {
      tools: [RESEARCH_OUTPUT_TOOL],
      toolChoice: { type: "tool", name: "research_output" },
    });

    let baseOutput: ResearchOutput = {
      summary: "",
      findings: [],
      recommendations: [],
      sources: findings.map((f) => f.url),
      modules: [],
      depth_used: depth,
      publishable: false,
      seo_relevant: false,
      lead_opportunities: false,
      urgency_score: 0,
      suggested_action: "brief",
    };

    if (response.toolUse?.toolName === "research_output") {
      const input = response.toolUse.input as Record<string, unknown>;
      baseOutput = {
        summary: (input.summary as string) ?? "",
        findings: Array.isArray(input.findings) ? (input.findings as ResearchOutput["findings"]) : [],
        recommendations: Array.isArray(input.recommendations) ? (input.recommendations as string[]) : [],
        sources: Array.isArray(input.sources) ? (input.sources as string[]) : findings.map((f) => f.url),
        modules: [],
        depth_used: depth,
        publishable: (input.publishable as boolean) ?? false,
        seo_relevant: (input.seo_relevant as boolean) ?? false,
        lead_opportunities: (input.lead_opportunities as boolean) ?? false,
        urgency_score: (input.urgency_score as number) ?? 0,
        suggested_action: (input.suggested_action as ResearchOutput["suggested_action"]) ?? "brief",
      };
    }

    // Generate task-specific module if applicable
    const moduleType = TASK_MODULE_MAP[taskType];
    if (moduleType && depth !== "quick") {
      const mod = await this.generateModule(moduleType, findings, topic);
      if (mod) {
        baseOutput.modules.push(mod);
      }
    }

    return baseOutput;
  }

  // ── Module Generators ───────────────────────────────────────────

  private async generateModule(
    moduleType: OutputModule["type"],
    findings: AnalyzedFinding[],
    topic: string,
  ): Promise<OutputModule | null> {
    const findingsText = findings
      .slice(0, 10)
      .map((f) => `- ${f.title}: ${f.summary}`)
      .join("\n");

    const basePrompt = [
      `Generera en ${moduleType}-modul baserat på följande fynd om "${topic}".`,
      `Skriv på svenska.`,
      "",
      findingsText,
    ].join("\n");

    const toolMap: Record<string, ToolDefinition> = {
      swot: SWOT_MODULE_TOOL,
      timeline: TIMELINE_MODULE_TOOL,
      scorecard: SCORECARD_MODULE_TOOL,
      talent_matrix: TALENT_MATRIX_MODULE_TOOL,
      company_profile: COMPANY_PROFILE_MODULE_TOOL,
    };

    const tool = toolMap[moduleType];
    if (!tool) return null;

    try {
      const response = await this.callLLM("standard_analysis", basePrompt, {
        tools: [tool],
        toolChoice: { type: "tool", name: tool.name },
      });

      if (response.toolUse?.toolName === tool.name) {
        return {
          type: moduleType,
          data: response.toolUse.input as Record<string, unknown>,
        };
      }
    } catch (err) {
      this.logger.warn(`Module generation failed (${moduleType}): ${(err as Error).message}`, {
        agent: this.slug,
        action: "module_error",
        module: moduleType,
      });
    }

    return null;
  }

  // ── Intelligence Profiles ───────────────────────────────────────

  private async loadIntelligenceProfile(topicSlug: string): Promise<IntelligenceProfileRow | null> {
    try {
      return await getProfile(this.supabase, topicSlug);
    } catch (err) {
      this.logger.warn(`Failed to load profile "${topicSlug}": ${(err as Error).message}`, {
        agent: this.slug,
        action: "profile_load_error",
      });
      return null;
    }
  }

  private async upsertIntelligenceProfile(
    topicSlug: string,
    topicName: string,
    category: IntelligenceProfileRow["category"],
    output: ResearchOutput,
    findings: AnalyzedFinding[],
  ): Promise<void> {
    try {
      const existing = await this.loadIntelligenceProfile(topicSlug);

      const mergedFacts = {
        ...(existing?.key_facts ?? {}),
        latest_summary: output.summary,
        latest_recommendations: output.recommendations,
        updated_at: new Date().toISOString(),
      };

      const existingSources = existing?.sources ?? [];
      const newSources = output.sources.filter((s) => !existingSources.includes(s));
      const mergedSources = [...existingSources, ...newSources].slice(-100);

      await upsertProfile(this.supabase, {
        topic_slug: topicSlug,
        topic_name: topicName,
        category,
        summary: output.summary,
        key_facts: mergedFacts,
        research_count: (existing?.research_count ?? 0) + 1,
        sources: mergedSources,
      });

      this.logger.info(`Intelligence profile upserted: ${topicSlug}`, {
        agent: this.slug,
        action: "profile_upserted",
        topic_slug: topicSlug,
        research_count: (existing?.research_count ?? 0) + 1,
      });
    } catch (err) {
      this.logger.warn(`Failed to upsert profile: ${(err as Error).message}`, {
        agent: this.slug,
        action: "profile_upsert_error",
      });
    }
  }

  private inferProfileCategory(taskType: string): IntelligenceProfileRow["category"] {
    switch (taskType) {
      case "competitor_deep_dive":
        return "competitor";
      case "trend_analysis":
        return "trend";
      case "tech_watch":
        return "technology";
      case "company_industry_analysis":
        return "industry";
      case "talent_intel":
        return "industry";
      default:
        return "trend";
    }
  }

  // ── Enrichment: scan ↔ research ─────────────────────────────────

  private suggestResearchTopics(scored: ScoredFinding[]): string[] {
    return scored
      .filter((f) => f.signal_score >= 0.8)
      .slice(0, 3)
      .map((f) => f.title);
  }

  private async addTemporaryWatchDomain(topic: string, keywords: string[]): Promise<void> {
    const filePath = path.join(this.config.knowledgeDir, "agents", this.slug, "memory", "temp-watch-domains.json");

    let existing: TempWatchDomain[] = [];
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      existing = JSON.parse(content) as TempWatchDomain[];
    } catch {
      // File doesn't exist yet
    }

    // Remove expired entries (7 days TTL)
    const now = Date.now();
    existing = existing.filter((d) => new Date(d.expires_at).getTime() > now);

    // Add new entry
    existing.push({
      topic,
      keywords,
      added_at: new Date().toISOString(),
      expires_at: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await this.writeMemory("memory/temp-watch-domains.json", existing);
  }

  private mergeTempWatchDomains(watchConfig: WatchDomainsConfig): void {
    const filePath = path.join(this.config.knowledgeDir, "agents", this.slug, "memory", "temp-watch-domains.json");

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const tempDomains = JSON.parse(content) as TempWatchDomain[];
      const now = Date.now();

      for (const temp of tempDomains) {
        if (new Date(temp.expires_at).getTime() <= now) continue;

        watchConfig.domains.push({
          slug: `temp:${this.slugifyTopic(temp.topic)}`,
          name: `Temp: ${temp.topic}`,
          weight: 0.8,
          keywords: {
            primary: temp.keywords,
          },
        });
      }
    } catch {
      // No temp domains file
    }
  }

  // ── Compliance Mode (scoring & filtering) ──────────────────────

  // resolveComplianceMode() is inherited from BaseAgent

  private buildScoringPrompt(findingsText: string, mode: ComplianceMode, topic?: string): string {
    if (mode === "strict") {
      return [
        "Bedöm relevansen av följande sökresultat för Forefront Consulting Group.",
        "Forefront är ett konsultbolag som hjälper företag med AI-transformation och digital strategi.",
        "",
        "Scora VARJE resultat på fyra dimensioner (0.0–1.0):",
        "- domain_relevance (0.35): Hur starkt relaterar innehållet till bevakningsdomänen?",
        "- forefront_impact (0.30): Hur mycket påverkar detta Forefront specifikt?",
        "- actionability (0.20): Kan Forefront agera på detta?",
        "- recency_novelty (0.15): Är det nytt och oväntat?",
        "",
        "--- RESULTAT ---",
        findingsText,
      ].join("\n");
    }

    if (mode === "balanced") {
      return [
        `Bedöm relevansen av följande sökresultat för ämnet: "${topic}".`,
        "Scora mot ÄMNET, inte mot något specifikt företag.",
        "",
        "Scora VARJE resultat på fyra dimensioner (0.0–1.0):",
        "- domain_relevance (0.50): Hur starkt relaterar innehållet till ämnet?",
        "- forefront_impact (0.10): Hur relevant är detta för konsultverksamhet?",
        "- actionability (0.25): Hur handlingsbar är informationen?",
        "- recency_novelty (0.15): Är det nytt och oväntat?",
        "",
        "--- RESULTAT ---",
        findingsText,
      ].join("\n");
    }

    // mode === "open"
    return [
      `Bedöm följande sökresultat för ämnet: "${topic}".`,
      "Scora generöst — alla resultat som tangerar ämnet ska inkluderas.",
      "",
      "Scora VARJE resultat på fyra dimensioner (0.0–1.0):",
      "- domain_relevance (0.60): Hur starkt relaterar innehållet till ämnet?",
      "- forefront_impact (0.05): Bonus om det har konsultrelevans (annars ge 0.5)",
      "- actionability (0.20): Hur handlingsbar är informationen?",
      "- recency_novelty (0.15): Är det nytt och oväntat?",
      "",
      "--- RESULTAT ---",
      findingsText,
    ].join("\n");
  }

  private buildDeepAnalysisPrompt(findingsText: string, mode: ComplianceMode, topic?: string): string {
    if (mode === "strict") {
      return [
        "Djupanalysera följande högrelevanta omvärldsfynd för Forefront Consulting Group.",
        "Forefront är ett konsultbolag som hjälper företag med AI-transformation och digital strategi.",
        "",
        "För VARJE fynd, ge:",
        "- summary: 2–3 meningars sammanfattning",
        "- implications: Vad betyder detta för Forefront specifikt?",
        "- suggested_action: brief | rapid_response | strategy_input | escalate",
        "- confidence: 0.0–1.0",
        "",
        "Regler för suggested_action:",
        "- escalate: Konkurrent namnger Forefront, kris, regulatorisk förändring",
        "- rapid_response: Konkurrent lanserar överlappande tjänst, branschrapport, positioneringsmöjlighet",
        "- strategy_input: LLM-prisändring >20%, marknadsförskjutning, ny teknologi",
        "- brief: Default – informativt, ingen omedelbar handling",
        "",
        "--- FYND ---",
        findingsText,
      ].join("\n");
    }

    // balanced / open
    return [
      `Djupanalysera följande högrelevanta fynd om "${topic}".`,
      "",
      "För VARJE fynd, ge:",
      "- summary: 2–3 meningars sammanfattning",
      "- implications: Vad är de viktigaste implikationerna?",
      "- suggested_action: brief | rapid_response | strategy_input | escalate",
      "- confidence: 0.0–1.0",
      "",
      "Regler för suggested_action:",
      "- escalate: Kris, stor regulatorisk förändring, oväntad risk",
      "- rapid_response: Viktig nyhet, positioneringsmöjlighet",
      "- strategy_input: Marknadsförskjutning, ny teknologi, prisändring >20%",
      "- brief: Default – informativt, ingen omedelbar handling",
      "",
      "--- FYND ---",
      findingsText,
    ].join("\n");
  }

  private getThresholds(mode: ComplianceMode): { minScore: number; deepAnalysisScore: number } {
    switch (mode) {
      case "strict":
        return { minScore: 0.6, deepAnalysisScore: 0.7 };
      case "balanced":
        return { minScore: 0.3, deepAnalysisScore: 0.5 };
      case "open":
        return { minScore: 0.0, deepAnalysisScore: 0.0 };
    }
  }

  // ── Utility ─────────────────────────────────────────────────────

  /** Non-fatal sub_status update – metadata should never crash a pipeline. */
  private async safeSubStatus(taskId: string, subStatus: string): Promise<void> {
    try {
      await updateTaskSubStatus(this.supabase, taskId, subStatus);
    } catch (err) {
      this.logger.warn(`Failed to set sub_status="${subStatus}" for task ${taskId}: ${(err as Error).message}`, {
        agent: this.slug,
        action: "sub_status_error",
      });
    }
  }

  private slugifyTopic(title: string): string {
    return title
      .toLowerCase()
      .replace(/[åä]/g, "a")
      .replace(/[ö]/g, "o")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
  }

  private formatResearchBody(output: ResearchOutput): string {
    const sections: string[] = [];

    sections.push(`## Sammanfattning\n\n${output.summary}`);

    if (output.findings.length > 0) {
      const findingsText = output.findings
        .map((f) => `### ${f.title}\n${f.detail}\n**Källa:** ${f.source}\n**Relevans:** ${f.relevance.toFixed(1)}/1.0`)
        .join("\n\n");
      sections.push(`## Nyckelinsikter\n\n${findingsText}`);
    }

    for (const mod of output.modules) {
      sections.push(
        `## ${mod.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${JSON.stringify(mod.data, null, 2)}`,
      );
    }

    if (output.recommendations.length > 0) {
      sections.push(`## Rekommendationer\n\n${output.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}`);
    }

    if (output.sources.length > 0) {
      sections.push(`## Källor\n\n${output.sources.map((s) => `- ${s}`).join("\n")}`);
    }

    return sections.join("\n\n---\n\n");
  }
}
