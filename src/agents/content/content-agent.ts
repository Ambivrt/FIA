import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest, loadAgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { BrandAgent, ReviewRequest } from "../brand/brand-agent";
import { routeImageRequest } from "../../gateway/router";
import { updateTaskStatus } from "../../supabase/task-writer";
import { logActivity } from "../../supabase/activity-writer";
import { writeMetric } from "../../supabase/metrics-writer";
import { usdToSek } from "../../llm/pricing";

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
    let accumulatedCostUsd = 0;
    const maxAttempts = this.manifest.escalation_threshold;
    const feedbackHistory: Array<{ attempt: number; feedback: string }> = [];

    while (attempts < maxAttempts) {
      await task.onProgress?.("brand_reviewing", `:mag: Brand Agent granskar${attempts > 0 ? ` (${attempts + 1}/${maxAttempts})` : ""}...`, {
        task_id: result.taskId,
        attempt: attempts + 1,
      });

      const review = await brandAgent.review({
        taskId: result.taskId,
        agentSlug: this.slug,
        content: result.output,
        taskType: task.type,
      });

      if (review.decision === "approved") {
        await task.onProgress?.("brand_approved", `:white_check_mark: Brand Agent godkände`, {
          task_id: result.taskId,
        });
        return result;
      }

      if (review.escalated) {
        await task.onProgress?.("escalated", `:warning: Eskalerar till Orchestrator efter ${maxAttempts} avslag`, {
          task_id: result.taskId,
          feedback: review.feedback,
        });
        result.status = "escalated";
        return result;
      }

      attempts++;
      feedbackHistory.push({ attempt: attempts, feedback: review.feedback });

      if (attempts >= maxAttempts) break;

      await task.onProgress?.("brand_rejected", `:arrows_counterclockwise: Brand Agent underkände (${attempts}/${maxAttempts}) — omgenererar...`, {
        task_id: result.taskId,
        attempt: attempts,
        feedback: review.feedback,
      });

      // Re-generate with Brand Agent feedback, preserving original intent
      this.logger.info(`Content Agent re-generating (attempt ${attempts + 1}): ${task.title}`, {
        agent: this.slug,
        task_id: result.taskId,
        action: "regenerate",
      });

      const feedbackSection = feedbackHistory
        .map((f) => `Försök ${f.attempt}: ${f.feedback}`)
        .join("\n");

      const revisedInput = [
        "=== ORIGINALBEGÄRAN (MÅSTE BEVARAS) ===",
        task.input,
        "",
        "VIKTIGT: Du MÅSTE behålla ämnet, motivet och intentionen från originalbegäran ovan.",
        "Ändra ENBART det som Brand Agent-feedbacken kräver (tonalitet, formulering, varumärkesröst).",
        "Om du inte kan uppfylla originalbegäran inom varumärkesramarna, svara med exakt:",
        'INTENT_CONFLICT: [förklaring varför begäran inte kan uppfyllas inom varumärkesriktlinjerna]',
        "",
        "--- FEEDBACK FRÅN BRAND AGENT (all historik) ---",
        feedbackSection,
        "",
        "--- SENASTE FEEDBACK (fokusera på denna) ---",
        review.feedback,
      ].join("\n");

      await task.onProgress?.("llm_calling", `:brain: Content Agent omgenererar med feedback...`, {
        task_id: result.taskId,
        attempt: attempts + 1,
      });

      const response = await this.callLLM(task.type, revisedInput);

      // Check if Content Agent flagged an intent conflict
      if (response.text.startsWith("INTENT_CONFLICT:")) {
        const conflictReason = response.text.replace("INTENT_CONFLICT:", "").trim();

        this.logger.warn(`Content Agent detected intent conflict: ${conflictReason}`, {
          agent: this.slug,
          task_id: result.taskId,
          action: "intent_conflict",
          status: "escalated",
        });

        await task.onProgress?.("escalated", `:warning: Begäran kan inte uppfyllas inom varumärkesramarna — eskalerar till Orchestrator`, {
          task_id: result.taskId,
          feedback: conflictReason,
        });

        await updateTaskStatus(this.supabase, result.taskId, "awaiting_review", {
          content_json: {
            output: result.output,
            revision: attempts + 1,
            intent_conflict: conflictReason,
            original_request: task.input,
          },
        });

        await logActivity(this.supabase, {
          agent_id: await this.getAgentId(),
          action: "intent_conflict_escalated",
          details_json: {
            task_id: result.taskId,
            original_request: task.input,
            conflict_reason: conflictReason,
            feedback_history: feedbackHistory,
          },
        });

        // Notify via Slack
        const { getSlackApp } = await import("../../slack/app");
        const { sendEscalation } = await import("../../slack/handlers");
        const slackApp = getSlackApp();
        if (slackApp) {
          await sendEscalation(
            slackApp,
            this.logger,
            this.slug,
            result.taskId,
            `Begäran kan inte uppfyllas inom varumärkesramarna.\n\nOriginalbegäran: ${task.input}\n\nAnledning: ${conflictReason}`
          );
        }

        result.status = "escalated";
        return result;
      }

      const totalTokens = response.tokensIn + response.tokensOut;
      const durationSec = (response.durationMs / 1000).toFixed(1);
      await task.onProgress?.("llm_complete", `:white_check_mark: Omgenererat (${totalTokens} tokens, ${durationSec}s)`, {
        task_id: result.taskId,
        tokens: totalTokens,
        duration_ms: response.durationMs,
      });

      accumulatedCostUsd += response.costUsd;
      const totalCostSek = usdToSek(accumulatedCostUsd, this.config.usdToSek);

      await updateTaskStatus(this.supabase, result.taskId, "awaiting_review", {
        content_json: {
          output: response.text,
          revision: attempts + 1,
          original_request: task.input,
        },
        model_used: response.model,
        tokens_used: response.tokensIn + response.tokensOut,
        cost_sek: totalCostSek,
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

      const costSek = usdToSek(response.costUsd, this.config.usdToSek);

      await updateTaskStatus(this.supabase, taskId, "approved", {
        content_json: {
          image_base64: imageBase64,
          mime_type: response.mimeType,
        },
        model_used: response.model,
        cost_sek: costSek,
      });

      await writeMetric(this.supabase, {
        category: "cost",
        metric_name: "agent_cost_content",
        value: costSek,
        period: "daily",
        period_start: new Date().toISOString().slice(0, 10),
        metadata_json: { model: response.model, task_id: taskId, cost_usd: response.costUsd, type: "image" },
      });

      await logActivity(this.supabase, {
        agent_id: agentRow,
        action: "image_generated",
        details_json: { task_id: taskId, cost_sek: costSek },
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
