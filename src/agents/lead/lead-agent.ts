import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest, loadAgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { BrandAgent } from "../brand/brand-agent";

export class LeadAgent extends BaseAgent {
  readonly name = "Lead Agent";
  readonly slug = "lead";

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (task.type === "nurture_sequences") {
      return this.executeNurtureWithReview(task);
    }

    // Lead scoring: standard execute with scoring-specific prompt enrichment
    if (task.type === "lead_scoring") {
      const scoringPrompt = [
        task.input,
        "",
        `MQL-gräns: ${this.manifest.score_threshold_mql ?? 75} poäng.`,
        "Returnera för varje lead: score (0-100), klassificering (MQL/SQL/Cold), och kort motivering.",
      ].join("\n");

      return super.execute({ ...task, input: scoringPrompt });
    }

    return super.execute(task);
  }

  private async executeNurtureWithReview(task: AgentTask): Promise<AgentResult> {
    const result = await super.execute(task);
    if (result.status === "error") return result;

    // Nurture sequences pass through Brand Agent review
    const brandManifest = loadAgentManifest(this.config.knowledgeDir, "brand");
    const brandAgent = new BrandAgent(this.config, this.logger, this.supabase, brandManifest);

    const review = await brandAgent.review({
      taskId: result.taskId,
      agentSlug: this.slug,
      content: result.output,
      taskType: task.type,
    });

    if (review.decision !== "approved") {
      result.status = review.escalated ? "escalated" : "awaiting_review";
    }

    return result;
  }
}
