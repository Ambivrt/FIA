import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";

export class StrategyAgent extends BaseAgent {
  readonly name = "Strategy Agent";
  readonly slug = "strategy";

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    // Research tasks: first search, then summarize with claude-opus
    if (task.type === "research" || task.type === "trend_analysis") {
      return this.executeResearch(task);
    }

    // All strategy outputs require Orchestrator approval (sample_review_rate: 1.0)
    return super.execute(task);
  }

  private async executeResearch(task: AgentTask): Promise<AgentResult> {
    // Step 1: Search via google-search routing
    const searchResponse = await this.callLLM(task.type, task.input);

    // Step 2: Summarize search results with claude-opus
    const summarizePrompt = [
      `Sammanfatta och analysera följande sökresultat för Forefront.`,
      `Ursprunglig fråga: ${task.input}`,
      "",
      "--- SÖKRESULTAT ---",
      searchResponse.text,
      "",
      "Ge en strukturerad analys med:",
      "1. Nyckelinsikter",
      "2. Relevans för Forefront",
      "3. Rekommenderade åtgärder",
    ].join("\n");

    const analysisResponse = await this.callLLM("default", summarizePrompt);

    // Create task in Supabase with combined results
    const agentRow = await this.getAgentId();
    const { createTask, updateTaskStatus } = await import("../../supabase/task-writer");
    const { logActivity } = await import("../../supabase/activity-writer");

    const taskId = await createTask(this.supabase, {
      agent_id: agentRow,
      type: task.type,
      title: task.title,
      priority: task.priority ?? "normal",
    });

    await updateTaskStatus(this.supabase, taskId, "awaiting_review", {
      content_json: {
        search_results: searchResponse.text,
        analysis: analysisResponse.text,
      },
      model_used: analysisResponse.model,
      tokens_used:
        searchResponse.tokensIn + searchResponse.tokensOut + analysisResponse.tokensIn + analysisResponse.tokensOut,
    });

    await logActivity(this.supabase, {
      agent_id: agentRow,
      action: "research_completed",
      details_json: { task_id: taskId, type: task.type },
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
}
