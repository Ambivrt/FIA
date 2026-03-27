import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { TaskSubStatus } from "../../engine/status-machine";
import { runSelfEval } from "../self-eval";

/** Task types that use the research pipeline (search → analyze). */
const RESEARCH_TASK_TYPES = ["strategic_research", "competitive_response"];

/** Task types that require full (100%) review. */
const FULL_REVIEW_TASK_TYPES = [
  "quarterly_plan",
  "monthly_plan",
  "campaign_brief",
  "channel_strategy",
  "some_strategy",
  "ads_strategy",
  "budget_allocation",
  "audience_strategy",
];

/** Task types with sampled (50%) review. */
const SAMPLED_REVIEW_TASK_TYPES = ["strategic_research", "competitive_response"];
const SAMPLED_REVIEW_RATE = 0.5;

interface EscalationRule {
  name: string;
  check: (contentJson: Record<string, unknown>) => boolean;
  message: string;
}

const ESCALATION_RULES: EscalationRule[] = [
  {
    name: "budget_threshold",
    check: (c) => typeof c.total_budget_sek === "number" && c.total_budget_sek > 50_000,
    message: "Budget överstiger 50 000 SEK — kräver ledningsgrupp-godkännande",
  },
  {
    name: "strategic_pivot",
    check: (c) => c.strategic_shift === true,
    message: "Analysen visar behov av strategisk pivot — eskalerar till Orchestrator",
  },
  {
    name: "channel_conflict",
    check: (c) => Array.isArray(c.channel_conflicts) && c.channel_conflicts.length > 0,
    message: "Kanalkonflikt detekterad — eskalerar till Orchestrator",
  },
];

export class StrategyAgent extends BaseAgent {
  readonly name = "Strategy Agent";
  readonly slug = "strategy";

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (RESEARCH_TASK_TYPES.includes(task.type)) {
      return this.executeResearch(task);
    }
    return this.executeStrategy(task);
  }

  // ---------------------------------------------------------------------------
  // Strategy pipeline: researching → analyzing → drafting → aligning
  // ---------------------------------------------------------------------------

  private async executeStrategy(task: AgentTask): Promise<AgentResult> {
    const agentRow = await this.getAgentId();
    const { createTask, updateTaskStatus } = await import("../../supabase/task-writer");
    const { logActivity } = await import("../../supabase/activity-writer");

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
    await logActivity(this.supabase, {
      agent_id: agentRow,
      action: "task_started",
      details_json: { task_id: taskId, type: task.type },
    });

    // Step 1: Researching — collect data context
    await task.onProgress?.("researching", `:mag: Strategy Agent samlar data...`, {
      task_id: taskId,
      task_type: task.type,
    });
    await this.setSubStatus(taskId, "researching");
    const dataContext = await this.callLLMWithTools(
      task.type,
      [
        `Samla in relevant data och kontext för att skapa: ${task.title}`,
        `Typ: ${task.type}`,
        `Input: ${task.input}`,
        "",
        "Hämta relevant data från GA4, HubSpot och tillgängliga verktyg.",
      ].join("\n"),
    );

    // Step 2: Analyzing — identify patterns and opportunities
    await task.onProgress?.("analyzing", `:brain: Strategy Agent analyserar data...`, {
      task_id: taskId,
    });
    await this.setSubStatus(taskId, "analyzing");
    const analysisPrompt = [
      `Analysera följande data och identifiera mönster, möjligheter och risker.`,
      `Uppgift: ${task.title} (${task.type})`,
      "",
      "--- DATA ---",
      dataContext.text,
      "",
      "Ge en strukturerad analys med:",
      "1. Nyckelinsikter från data",
      "2. Identifierade möjligheter",
      "3. Risker och utmaningar",
      "4. Rekommenderad riktning",
    ].join("\n");
    const analysis = await this.callLLM("default", analysisPrompt);

    // Step 3: Drafting — create the strategy/plan
    await task.onProgress?.("drafting", `:memo: Strategy Agent utformar strategi...`, {
      task_id: taskId,
    });
    await this.setSubStatus(taskId, "drafting");
    const draftPrompt = [
      `Skapa ett komplett utkast baserat på analysen.`,
      `Typ: ${task.type}`,
      `Input: ${task.input}`,
      "",
      "--- ANALYS ---",
      analysis.text,
      "",
      "Följ mallen för denna task type. Inkludera konkreta KPI:er och mätbara mål.",
    ].join("\n");
    const draft = await this.callLLM(task.type, draftPrompt);

    // Step 4: Aligning — check brand, goals, budget alignment
    await task.onProgress?.("aligning", `:dart: Strategy Agent kvalitetssäkrar...`, {
      task_id: taskId,
    });
    await this.setSubStatus(taskId, "aligning");
    const selfEvalResult = await this.runSelfEval(draft.text);

    const contentJson: Record<string, unknown> = {
      data_context: dataContext.text,
      analysis: analysis.text,
      output: draft.text,
      eval_score: selfEvalResult?.score ?? null,
      eval_pass: selfEvalResult?.pass ?? null,
      eval_issues: selfEvalResult?.issues ?? [],
    };

    // Check escalation rules
    const escalation = this.checkEscalation(contentJson);

    const totalTokensIn = dataContext.tokensIn + analysis.tokensIn + draft.tokensIn;
    const totalTokensOut = dataContext.tokensOut + analysis.tokensOut + draft.tokensOut;
    const totalDuration = dataContext.durationMs + analysis.durationMs + draft.durationMs;

    // Determine review status
    const targetStatus = this.determineReviewStatus(task.type, escalation);

    if (escalation) {
      contentJson.escalation = escalation;
    }

    await updateTaskStatus(this.supabase, taskId, targetStatus, {
      content_json: contentJson,
      model_used: draft.model,
      tokens_used: totalTokensIn + totalTokensOut,
    });

    await logActivity(this.supabase, {
      agent_id: agentRow,
      action: "strategy_completed",
      details_json: {
        task_id: taskId,
        type: task.type,
        eval_score: selfEvalResult?.score ?? null,
        escalated: !!escalation,
      },
    });

    return {
      taskId,
      output: draft.text,
      model: draft.model,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      durationMs: totalDuration,
      status: "completed",
    };
  }

  // ---------------------------------------------------------------------------
  // Research pipeline: search → summarize (for research, trend_analysis, competitive_response)
  // ---------------------------------------------------------------------------

  private async executeResearch(task: AgentTask): Promise<AgentResult> {
    const agentRow = await this.getAgentId();
    const { createTask, updateTaskStatus } = await import("../../supabase/task-writer");
    const { logActivity } = await import("../../supabase/activity-writer");

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
    await logActivity(this.supabase, {
      agent_id: agentRow,
      action: "task_started",
      details_json: { task_id: taskId, type: task.type },
    });

    // Step 1: Researching — search for information
    await task.onProgress?.("researching", `:mag: Strategy Agent söker information...`, {
      task_id: taskId,
      task_type: task.type,
    });
    await this.setSubStatus(taskId, "researching");
    const searchResponse = await this.callLLM(task.type, task.input);

    // Step 2: Analyzing — summarize and analyze results
    await task.onProgress?.("analyzing", `:brain: Strategy Agent analyserar sökresultat...`, {
      task_id: taskId,
    });
    await this.setSubStatus(taskId, "analyzing");
    const summarizePrompt = [
      `Sammanfatta och analysera följande sökresultat för Forefront.`,
      `Ursprunglig fråga: ${task.input}`,
      `Typ: ${task.type}`,
      "",
      "--- SÖKRESULTAT ---",
      searchResponse.text,
      "",
      "Ge en strukturerad analys med:",
      "1. Nyckelinsikter",
      "2. Relevans för Forefront",
      "3. Rekommenderade åtgärder",
      task.type === "competitive_response" ? "4. Allvarlighetsgrad (låg/medium/hög/kritisk)" : "",
      task.type === "competitive_response" ? "5. Rekommenderad responstid" : "",
    ].join("\n");

    const analysisResponse = await this.callLLM("default", summarizePrompt);

    const contentJson: Record<string, unknown> = {
      search_results: searchResponse.text,
      analysis: analysisResponse.text,
      output: analysisResponse.text,
    };

    // Check escalation rules for competitive_response
    const escalation = this.checkEscalation(contentJson);
    if (escalation) {
      contentJson.escalation = escalation;
    }

    const targetStatus = this.determineReviewStatus(task.type, escalation);

    await updateTaskStatus(this.supabase, taskId, targetStatus, {
      content_json: contentJson,
      model_used: analysisResponse.model,
      tokens_used:
        searchResponse.tokensIn + searchResponse.tokensOut + analysisResponse.tokensIn + analysisResponse.tokensOut,
    });

    await logActivity(this.supabase, {
      agent_id: agentRow,
      action: "research_completed",
      details_json: {
        task_id: taskId,
        type: task.type,
        escalated: !!escalation,
      },
    });

    return {
      taskId,
      output: analysisResponse.text,
      model: analysisResponse.model,
      tokensIn: searchResponse.tokensIn + analysisResponse.tokensIn,
      tokensOut: searchResponse.tokensOut + analysisResponse.tokensOut,
      durationMs: searchResponse.durationMs + analysisResponse.durationMs,
      status: "completed",
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async runSelfEval(output: string): Promise<{ pass: boolean; score: number; issues: string[] } | null> {
    const selfEvalConfig = this.manifest.self_eval;
    if (!selfEvalConfig?.enabled) return null;
    return runSelfEval(this.config, this.logger, this.slug, output, selfEvalConfig);
  }

  private async setSubStatus(taskId: string, subStatus: TaskSubStatus): Promise<void> {
    const { updateTaskSubStatus } = await import("../../supabase/task-writer");
    await updateTaskSubStatus(this.supabase, taskId, subStatus);
    this.logger.info(`[strategy] ${taskId} → sub_status: ${subStatus}`);
  }

  private checkEscalation(contentJson: Record<string, unknown>): { rule: string; message: string } | null {
    for (const rule of ESCALATION_RULES) {
      if (rule.check(contentJson)) {
        this.logger.warn(`[strategy] Escalation triggered: ${rule.name}`);
        return { rule: rule.name, message: rule.message };
      }
    }
    return null;
  }

  private determineReviewStatus(taskType: string, escalation: { rule: string; message: string } | null): string {
    // Escalation always forces review
    if (escalation) return "awaiting_review";

    // Full review task types always go to review
    if (FULL_REVIEW_TASK_TYPES.includes(taskType)) return "awaiting_review";

    // Sampled review: 50% chance of review
    if (SAMPLED_REVIEW_TASK_TYPES.includes(taskType)) {
      return Math.random() < SAMPLED_REVIEW_RATE ? "awaiting_review" : "delivered";
    }

    // Default: review
    return "awaiting_review";
  }
}
