import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { TaskSubStatus } from "../../engine/status-machine";
import { runSelfEval } from "../self-eval";
import { StepTracker } from "../step-tracker";

/** Task types that use the research pipeline (search \u2192 analyze). */
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
    message: "Budget \u00f6verstiger 50 000 SEK \u2014 kr\u00e4ver ledningsgrupp-godk\u00e4nnande",
  },
  {
    name: "strategic_pivot",
    check: (c) => c.strategic_shift === true,
    message: "Analysen visar behov av strategisk pivot \u2014 eskalerar till Orchestrator",
  },
  {
    name: "channel_conflict",
    check: (c) => Array.isArray(c.channel_conflicts) && c.channel_conflicts.length > 0,
    message: "Kanalkonflikt detekterad \u2014 eskalerar till Orchestrator",
  },
];

export class StrategyAgent extends BaseAgent {
  readonly name = "Strategy Agent";
  readonly slug = "strategy";

  constructor(
    config: AppConfig,
    logger: Logger,
    supabase: SupabaseClient,
    manifest: AgentManifest,
  ) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (RESEARCH_TASK_TYPES.includes(task.type)) {
      return this.executeResearch(task);
    }
    return this.executeStrategy(task);
  }

  // ---------------------------------------------------------------------------
  // Strategy pipeline: researching \u2192 analyzing \u2192 drafting \u2192 aligning
  // ---------------------------------------------------------------------------

  private async executeStrategy(task: AgentTask): Promise<AgentResult> {
    const agentRow = await this.getAgentId();
    const { createTask, updateTaskStatus } = await import(
      "../../supabase/task-writer"
    );
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

    const tracker = this.createStepTracker();

    try {
      // Step 1: Researching \u2014 collect data context
      tracker.startStep("researching");
      await task.onProgress?.(
        "researching",
        `:mag: Strategy Agent samlar data...`,
        {
          task_id: taskId,
          task_type: task.type,
        },
      );
      await this.setSubStatus(taskId, "researching");
      const dataContext = await this.callLLMWithTools(
        task.type,
        [
          `Samla in relevant data och kontext f\u00f6r att skapa: ${task.title}`,
          `Typ: ${task.type}`,
          `Input: ${task.input}`,
          "",
          "H\u00e4mta relevant data fr\u00e5n GA4, HubSpot och tillg\u00e4ngliga verktyg.",
        ].join("\n"),
      );

      // Step 2: Analyzing \u2014 identify patterns and opportunities
      tracker.startStep("analyzing");
      await task.onProgress?.(
        "analyzing",
        `:brain: Strategy Agent analyserar data...`,
        {
          task_id: taskId,
        },
      );
      await this.setSubStatus(taskId, "analyzing");
      const analysisPrompt = [
        `Analysera f\u00f6ljande data och identifiera m\u00f6nster, m\u00f6jligheter och risker.`,
        `Uppgift: ${task.title} (${task.type})`,
        "",
        "--- DATA ---",
        dataContext.text,
        "",
        "Ge en strukturerad analys med:",
        "1. Nyckelinsikter fr\u00e5n data",
        "2. Identifierade m\u00f6jligheter",
        "3. Risker och utmaningar",
        "4. Rekommenderad riktning",
      ].join("\n");
      const analysis = await this.callLLM("default", analysisPrompt);

      // Step 3: Drafting \u2014 create the strategy/plan
      tracker.startStep("drafting");
      await task.onProgress?.(
        "drafting",
        `:memo: Strategy Agent utformar strategi...`,
        {
          task_id: taskId,
        },
      );
      await this.setSubStatus(taskId, "drafting");
      const draftPrompt = [
        `Skapa ett komplett utkast baserat p\u00e5 analysen.`,
        `Typ: ${task.type}`,
        `Input: ${task.input}`,
        "",
        "--- ANALYS ---",
        analysis.text,
        "",
        "F\u00f6lj mallen f\u00f6r denna task type. Inkludera konkreta KPI:er och m\u00e4tbara m\u00e5l.",
      ].join("\n");
      const draft = await this.callLLM(task.type, draftPrompt);

      // Step 4: Aligning \u2014 check brand, goals, budget alignment
      tracker.startStep("aligning");
      await task.onProgress?.(
        "aligning",
        `:dart: Strategy Agent kvalitetss\u00e4krar...`,
        {
          task_id: taskId,
        },
      );
      await this.setSubStatus(taskId, "aligning");
      const selfEvalResult = await this.runSelfEval(draft.text);

      tracker.complete();

      const contentJson: Record<string, unknown> = {
        data_context: dataContext.text,
        analysis: analysis.text,
        output: draft.text,
        eval_score: selfEvalResult?.score ?? null,
        eval_pass: selfEvalResult?.pass ?? null,
        eval_issues: selfEvalResult?.issues ?? [],
        _steps: tracker.toArray(),
      };

      // Check escalation rules
      const escalation = this.checkEscalation(contentJson);

      const totalTokensIn =
        dataContext.tokensIn + analysis.tokensIn + draft.tokensIn;
      const totalTokensOut =
        dataContext.tokensOut + analysis.tokensOut + draft.tokensOut;
      const totalDuration =
        dataContext.durationMs + analysis.durationMs + draft.durationMs;

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
    } catch (err) {
      const message = (err as Error).message;
      tracker.failStep(message);
      try {
        await updateTaskStatus(this.supabase, taskId, "error", {
          content_json: { error: message, _steps: tracker.toArray() },
        });
        await logActivity(this.supabase, {
          agent_id: agentRow,
          action: "task_error",
          details_json: { task_id: taskId, error: message },
        });
      } catch (updateErr) {
        this.logger.error(
          `Failed to write error status for task ${taskId}: ${(updateErr as Error).message}`,
          {
            agent: this.slug,
            task_id: taskId,
            action: "task_error_write_failed",
          },
        );
      }
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

  // ---------------------------------------------------------------------------
  // Research pipeline: search \u2192 summarize (for research, trend_analysis, competitive_response)
  // ---------------------------------------------------------------------------

  private async executeResearch(task: AgentTask): Promise<AgentResult> {
    const agentRow = await this.getAgentId();
    const { createTask, updateTaskStatus } = await import(
      "../../supabase/task-writer"
    );
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

    const tracker = this.createStepTracker();

    try {
      // Step 1: Researching \u2014 search for information
      tracker.startStep("researching");
      await task.onProgress?.(
        "researching",
        `:mag: Strategy Agent s\u00f6ker information...`,
        {
          task_id: taskId,
          task_type: task.type,
        },
      );
      await this.setSubStatus(taskId, "researching");
      const searchResponse = await this.callLLM(task.type, task.input);

      // Step 2: Analyzing \u2014 summarize and analyze results
      tracker.startStep("analyzing");
      await task.onProgress?.(
        "analyzing",
        `:brain: Strategy Agent analyserar s\u00f6kresultat...`,
        {
          task_id: taskId,
        },
      );
      await this.setSubStatus(taskId, "analyzing");
      const summarizePrompt = [
        `Sammanfatta och analysera f\u00f6ljande s\u00f6kresultat f\u00f6r Forefront.`,
        `Ursprunglig fr\u00e5ga: ${task.input}`,
        `Typ: ${task.type}`,
        "",
        "--- S\u00d6KRESULTAT ---",
        searchResponse.text,
        "",
        "Ge en strukturerad analys med:",
        "1. Nyckelinsikter",
        "2. Relevans f\u00f6r Forefront",
        "3. Rekommenderade \u00e5tg\u00e4rder",
        task.type === "competitive_response"
          ? "4. Allvarlighetsgrad (l\u00e5g/medium/h\u00f6g/kritisk)"
          : "",
        task.type === "competitive_response"
          ? "5. Rekommenderad responstid"
          : "",
      ].join("\n");

      const analysisResponse = await this.callLLM("default", summarizePrompt);

      tracker.complete();

      const contentJson: Record<string, unknown> = {
        search_results: searchResponse.text,
        analysis: analysisResponse.text,
        output: analysisResponse.text,
        _steps: tracker.toArray(),
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
          searchResponse.tokensIn +
          searchResponse.tokensOut +
          analysisResponse.tokensIn +
          analysisResponse.tokensOut,
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
    } catch (err) {
      const message = (err as Error).message;
      tracker.failStep(message);
      try {
        await updateTaskStatus(this.supabase, taskId, "error", {
          content_json: { error: message, _steps: tracker.toArray() },
        });
        await logActivity(this.supabase, {
          agent_id: agentRow,
          action: "task_error",
          details_json: { task_id: taskId, error: message },
        });
      } catch (updateErr) {
        this.logger.error(
          `Failed to write error status for task ${taskId}: ${(updateErr as Error).message}`,
          {
            agent: this.slug,
            task_id: taskId,
            action: "task_error_write_failed",
          },
        );
      }
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async runSelfEval(
    output: string,
  ): Promise<{ pass: boolean; score: number; issues: string[] } | null> {
    const selfEvalConfig = this.manifest.self_eval;
    if (!selfEvalConfig?.enabled) return null;
    return runSelfEval(
      this.config,
      this.logger,
      this.slug,
      output,
      selfEvalConfig,
    );
  }

  private async setSubStatus(
    taskId: string,
    subStatus: TaskSubStatus,
  ): Promise<void> {
    const { updateTaskSubStatus } = await import(
      "../../supabase/task-writer"
    );
    await updateTaskSubStatus(this.supabase, taskId, subStatus);
    this.logger.info(`[strategy] ${taskId} \u2192 sub_status: ${subStatus}`);
  }

  private checkEscalation(
    contentJson: Record<string, unknown>,
  ): { rule: string; message: string } | null {
    for (const rule of ESCALATION_RULES) {
      if (rule.check(contentJson)) {
        this.logger.warn(
          `[strategy] Escalation triggered: ${rule.name}`,
        );
        return { rule: rule.name, message: rule.message };
      }
    }
    return null;
  }

  private determineReviewStatus(
    taskType: string,
    escalation: { rule: string; message: string } | null,
  ): string {
    // Escalation always forces review
    if (escalation) return "awaiting_review";

    // Full review task types always go to review
    if (FULL_REVIEW_TASK_TYPES.includes(taskType)) return "awaiting_review";

    // Sampled review: 50% chance of review
    if (SAMPLED_REVIEW_TASK_TYPES.includes(taskType)) {
      return Math.random() < SAMPLED_REVIEW_RATE
        ? "awaiting_review"
        : "delivered";
    }

    // Default: review
    return "awaiting_review";
  }
}
