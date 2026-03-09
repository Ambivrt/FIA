import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent } from "../base-agent";
import { createApproval, updateTaskStatus } from "../../supabase/task-writer";
import { logActivity } from "../../supabase/activity-writer";

export interface ReviewRequest {
  taskId: string;
  agentSlug: string;
  content: string;
  taskType: string;
}

export interface ReviewResult {
  decision: "approved" | "rejected" | "revision_requested";
  feedback: string;
}

export class BrandAgent extends BaseAgent {
  readonly name = "Brand Agent";
  readonly slug = "brand";

  constructor(
    config: AppConfig,
    logger: Logger,
    supabase: SupabaseClient,
    manifest: AgentManifest
  ) {
    super(config, logger, supabase, manifest);
  }

  async review(request: ReviewRequest): Promise<ReviewResult> {
    const prompt = [
      "Review the following content for brand alignment.",
      "Check: tone of voice, messaging hierarchy, visual identity guidelines, and Forefront brand values.",
      "Respond with a JSON object: { \"decision\": \"approved\" | \"rejected\" | \"revision_requested\", \"feedback\": \"...\" }",
      "",
      `Content type: ${request.taskType}`,
      `Source agent: ${request.agentSlug}`,
      "",
      "--- CONTENT TO REVIEW ---",
      request.content,
    ].join("\n");

    const response = await this.callLLM("default", prompt);

    let result: ReviewResult;
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { decision: "revision_requested", feedback: response.text };
    } catch {
      result = { decision: "revision_requested", feedback: response.text };
    }

    // Write approval to Supabase
    const agentId = await this.getAgentId();
    await createApproval(this.supabase, {
      task_id: request.taskId,
      reviewer_type: "brand_agent",
      decision: result.decision,
      feedback: result.feedback,
    });

    // Update task status
    if (result.decision === "approved") {
      await updateTaskStatus(this.supabase, request.taskId, "approved");
    } else {
      await updateTaskStatus(this.supabase, request.taskId, "rejected");
    }

    await logActivity(this.supabase, {
      agent_id: agentId,
      action: `review_${result.decision}`,
      details_json: {
        task_id: request.taskId,
        source_agent: request.agentSlug,
        feedback: result.feedback,
      },
    });

    this.logger.info(`Brand review: ${result.decision}`, {
      agent: this.slug,
      task_id: request.taskId,
      action: `review_${result.decision}`,
      model: response.model,
      brand_review: result.decision === "revision_requested" ? "rejected" : result.decision,
      tokens_in: response.tokensIn,
      tokens_out: response.tokensOut,
      duration_ms: response.durationMs,
      status: "success",
    });

    return result;
  }
}
