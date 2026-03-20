import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { searchGoogle } from "../../llm/google-search";
import { createTask, updateTaskStatus } from "../../supabase/task-writer";
import { logActivity } from "../../supabase/activity-writer";
import { writeMetric } from "../../supabase/metrics-writer";
import { usdToSek } from "../../llm/pricing";
import { ToolDefinition } from "../../llm/types";

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
          this.logger.warn(`Search failed for keyword "${keyword}" in domain ${domain.slug}: ${(err as Error).message}`, {
            agent: this.slug,
            action: "search_error",
            domain: domain.slug,
          });
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
  ): Promise<ScoredFinding[]> {
    if (findings.length === 0) return [];

    const scored: ScoredFinding[] = [];

    // Batch findings to avoid overwhelming the LLM with too many items
    for (let i = 0; i < findings.length; i += IntelligenceAgent.SCORING_BATCH_SIZE) {
      const batch = findings.slice(i, i + IntelligenceAgent.SCORING_BATCH_SIZE);
      const batchScored = await this.scoreBatch(batch, watchConfig);
      scored.push(...batchScored);
    }

    return scored.sort((a, b) => b.signal_score - a.signal_score);
  }

  private async scoreBatch(
    findings: RawFinding[],
    watchConfig: WatchDomainsConfig,
  ): Promise<ScoredFinding[]> {
    const findingsText = findings
      .map(
        (f, i) =>
          `[${i}] ${f.title}\nURL: ${f.url}\nSnippet: ${f.snippet}\nDomän: ${f.domain_slug}`,
      )
      .join("\n\n");

    const scoringPrompt = [
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

    const response = await this.callLLM("default", scoringPrompt, {
      tools: [SCORING_TOOL],
      toolChoice: { type: "tool", name: "signal_scoring" },
    });

    const scored: ScoredFinding[] = [];

    if (response.toolUse && response.toolUse.toolName === "signal_scoring") {
      const input = response.toolUse.input as Record<string, unknown>;
      const scores = Array.isArray(input?.scores) ? input.scores as Array<{
        url: string;
        domain_relevance: number;
        forefront_impact: number;
        actionability: number;
        recency_novelty: number;
      }> : [];

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

        if (compositeScore >= watchConfig.settings.min_relevance_score) {
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

  private async deepAnalyze(findings: ScoredFinding[]): Promise<AnalyzedFinding[]> {
    const highRelevance = findings.filter((f) => f.signal_score >= 0.7);
    if (highRelevance.length === 0) return [];

    const findingsText = highRelevance
      .map(
        (f, i) =>
          `[${i}] ${f.title} (score: ${f.signal_score.toFixed(2)})\nURL: ${f.url}\nSnippet: ${f.snippet}\nDomän: ${f.domain_slug}`,
      )
      .join("\n\n");

    const analysisPrompt = [
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

  private async handleRapidResponses(
    analyzed: AnalyzedFinding[],
    taskId: string,
  ): Promise<number> {
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
          const { data: contentAgent } = await this.supabase
            .from("agents")
            .select("id")
            .eq("slug", "content")
            .single();

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

      // Step 1: Load config and history
      const watchConfig = this.loadWatchDomains();
      const history = this.loadSourceHistory();

      // Step 2: Gather findings via Serper
      await task.onProgress?.("searching", `:globe_with_meridians: Söker ${watchConfig.domains.length} domäner + ${watchConfig.pinned_sources.length} fasta källor...`, {
        task_id: taskId,
      });

      const findings = await this.gatherFindings(watchConfig, history);
      const totalSearches = watchConfig.domains.reduce(
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
        await task.onProgress?.("analyzing", `:microscope: Djupanalyserar ${highRelevance.length} högrelevanta fynd...`, {
          task_id: taskId,
        });

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

      // Step 9: Build content_json
      const today = new Date().toISOString().split("T")[0];
      const contentJson = {
        content_type: "intelligence_brief",
        title: `Omvärldsbevakning ${today} – ${scanType}`,
        body: briefResponse.text,
        summary: `${scored.length} fynd, ${highRelevance.length} högrelevanta, ${rapidResponseCount} rapid responses`,
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

      await updateTaskStatus(this.supabase, taskId, "completed", {
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
        .eq("status", "completed")
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
      const competitorList = watchConfig.domains
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

      await updateTaskStatus(this.supabase, taskId, "completed", {
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
}
