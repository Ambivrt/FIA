import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest, loadAgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { BrandAgent, ReviewRequest } from "../brand/brand-agent";
import { routeImageRequest } from "../../gateway/router";
import { updateTaskStatus } from "../../supabase/task-writer";
import { logActivity } from "../../supabase/activity-writer";

export class ContentAgent extends BaseAgent {
  readonly name = "Content Agent";
  readonly slug = "content";

  constructor(
    config: AppConfig,
    logger: Logger,
    supabase: SupabaseClient,
    manifest: AgentManifest
  ) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (task.type === "images") {
      return this.generateImage(task);
    }

    return this.executeWithReview(task);
  }

  private async executeWithReview(task: AgentTask): Promise<AgentResult> {
    let result = await super.execute(task);
    if (result.status === "error") return result;

    const brandManifest = loadAgentManifest(this.config.knowledgeDir, "brand");
    const brandAgent = new BrandAgent(this.config, this.logger, this.supabase, brandManifest);

    let attempts = 0;
    const maxAttempts = this.manifest.escalation_threshold;

    while (attempts < maxAttempts) {
      const review = await brandAgent.review({
        taskId: result.taskId,
        agentSlug: this.slug,
        content: result.output,
        taskType: task.type,
      });

      if (review.decision === "approved") {
        return result;
      }

      if (review.escalated) {
        result.status = "escalated";
        return result;
      }

      attempts++;
      if (attempts >= maxAttempts) break;

      // Re-generate with Brand Agent feedback
      this.logger.info(`Content Agent re-generating (attempt ${attempts + 1}): ${task.title}`, {
        agent: this.slug,
        task_id: result.taskId,
        action: "regenerate",
      });

      const revisedInput = [
        task.input,
        "",
        "--- FEEDBACK FRÅN BRAND AGENT (åtgärda dessa punkter) ---",
        review.feedback,
      ].join("\n");

      const response = await this.callLLM(task.type, revisedInput);

      await updateTaskStatus(this.supabase, result.taskId, "awaiting_review", {
        content_json: { output: response.text, revision: attempts + 1 },
        model_used: response.model,
        tokens_used: response.tokensIn + response.tokensOut,
      });

      result = {
        ...result,
        output: response.text,
        model: response.model,
        tokensIn: result.tokensIn + response.tokensIn,
        tokensOut: result.tokensOut + response.tokensOut,
        durationMs: result.durationMs + response.durationMs,
      };
    }

    return result;
  }

  private async generateImage(task: AgentTask): Promise<AgentResult> {
    const agentRow = await this.getAgentId();
    const { createTask } = await import("../../supabase/task-writer");

    const taskId = await createTask(this.supabase, {
      agent_id: agentRow,
      type: task.type,
      title: task.title,
      priority: task.priority ?? "normal",
    });

    await updateTaskStatus(this.supabase, taskId, "in_progress");

    try {
      const response = await routeImageRequest(this.config, this.logger, {
        prompt: task.input,
      });

      const imageBase64 = response.imageData.toString("base64");

      await updateTaskStatus(this.supabase, taskId, "approved", {
        content_json: {
          image_base64: imageBase64,
          mime_type: response.mimeType,
        },
        model_used: response.model,
      });

      await logActivity(this.supabase, {
        agent_id: agentRow,
        action: "image_generated",
        details_json: { task_id: taskId },
      });

      return {
        taskId,
        output: `Image generated (${response.mimeType})`,
        model: response.model,
        tokensIn: 0,
        tokensOut: 0,
        durationMs: response.durationMs,
        status: "completed",
      };
    } catch (err) {
      const message = (err as Error).message;
      await updateTaskStatus(this.supabase, taskId, "error", {
        content_json: { error: message },
      });

      await logActivity(this.supabase, {
        agent_id: agentRow,
        action: "image_error",
        details_json: { task_id: taskId, error: message },
      });

      this.logger.error(`Image generation failed: ${message}`, {
        agent: this.slug,
        task_id: taskId,
        action: "image_error",
        status: "error",
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
}
