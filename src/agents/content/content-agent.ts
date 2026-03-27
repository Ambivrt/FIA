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
import { ToolDefinition } from "../../llm/types";
import { quickBrandScreen, isHighRiskContent } from "../brand/quick-screen";

const CONTENT_RESPONSE_TOOL: ToolDefinition = {
  name: "content_response",
  description: "Submit generated or revised content",
  input_schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The generated content text",
      },
      intent_conflict: {
        type: "boolean",
        description: "True if the original request cannot be fulfilled within brand guidelines",
      },
      conflict_description: {
        type: "string",
        description: "If intent_conflict is true, explain why the request conflicts with brand guidelines",
      },
    },
    required: ["content", "intent_conflict"],
  },
};

export class ContentAgent extends BaseAgent {
  readonly name = "Content Agent";
  readonly slug = "content";

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
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

    const complianceMode = this.resolveComplianceMode(task);

    // Open mode: skip all review — deliver directly
    if (complianceMode === "open") {
      this.logger.info("Compliance mode 'open': skipping brand review pipeline", {
        agent: this.slug,
        task_id: result.taskId,
        action: "compliance_skip_review",
      });
      return result;
    }

    // Pre-review brand screening for high-risk content (catches issues before formal Brand review)
    // Skipped in balanced mode — only runs in strict mode
    if (complianceMode === "strict" && isHighRiskContent(task.type, this.manifest.sample_review_rate)) {
      try {
        await task.onProgress?.("parallel_screening", `:mag: Parallell varumärkesscreening...`, {
          task_id: result.taskId,
        });

        const screening = await quickBrandScreen(this.config, this.logger, result.output, task.type);

        // Store screening result in pipeline (ensure pipeline exists)
        if (!result.pipeline) result.pipeline = {};
        result.pipeline.parallel_screening = {
          flagged: screening.flagged,
          issues: screening.issues,
          model: "claude-sonnet",
        };

        if (screening.flagged && screening.issues.length > 0) {
          this.logger.info("Parallel screening flagged issues", {
            action: "parallel_screen_flagged",
            agent: this.slug,
            task_id: result.taskId,
            issues: screening.issues,
          });

          await task.onProgress?.(
            "parallel_screen_revision",
            `:arrows_counterclockwise: Screening hittade problem — korrigerar...`,
            {
              task_id: result.taskId,
              issues: screening.issues,
            },
          );

          // One pre-correction round before formal Brand review
          const revisionInput = [
            "Korrigera följande text baserat på varumärkesscreeningen nedan.",
            "",
            "## Screening-feedback",
            ...screening.issues.map((i) => `- ${i}`),
            "",
            "## Originaltext",
            result.output,
          ].join("\n");

          const revision = await this.callLLM(task.type, revisionInput, {
            tools: [CONTENT_RESPONSE_TOOL],
            toolChoice: { type: "tool", name: "content_response" },
          });

          let revisedText = revision.text;
          if (revision.toolUse && revision.toolUse.toolName === "content_response") {
            revisedText = (revision.toolUse.input as { content: string }).content;
          }

          result = {
            ...result,
            output: revisedText,
            tokensIn: result.tokensIn + revision.tokensIn,
            tokensOut: result.tokensOut + revision.tokensOut,
            durationMs: result.durationMs + revision.durationMs,
          };

          await updateTaskStatus(this.supabase, result.taskId, "awaiting_review", {
            content_json: {
              output: revisedText,
              _pipeline: result.pipeline,
              pre_correction: true,
            },
          });
        }
      } catch (err) {
        // Screening failure is non-fatal – continue to Brand review
        this.logger.warn(`Parallel screening failed, continuing: ${(err as Error).message}`, {
          action: "parallel_screen_error",
          agent: this.slug,
          task_id: result.taskId,
        });
      }
    }

    const brandManifest = loadAgentManifest(this.config.knowledgeDir, "brand");
    const brandAgent = new BrandAgent(this.config, this.logger, this.supabase, brandManifest);

    let attempts = 0;
    let accumulatedCostUsd = 0;
    const maxAttempts = this.manifest.escalation_threshold;
    const feedbackHistory: Array<{ attempt: number; feedback: string }> = [];

    while (attempts < maxAttempts) {
      // Guard against infinite loops across the full pipeline (self-eval revisions + brand revisions)
      this.checkMaxIterations(result.taskId);

      await task.onProgress?.(
        "brand_reviewing",
        `:mag: Brand Agent granskar${attempts > 0 ? ` (${attempts + 1}/${maxAttempts})` : ""}...`,
        {
          task_id: result.taskId,
          attempt: attempts + 1,
        },
      );

      const review = await brandAgent.review({
        taskId: result.taskId,
        agentSlug: this.slug,
        content: result.output,
        taskType: task.type,
        complianceMode,
      });

      if (review.decision === "approved") {
        await task.onProgress?.("brand_approved", `:white_check_mark: Brand Agent godkände`, {
          task_id: result.taskId,
        });
        this.clearIterations(result.taskId);
        return result;
      }

      if (review.escalated) {
        await task.onProgress?.("escalated", `:warning: Eskalerar till Orchestrator efter ${maxAttempts} avslag`, {
          task_id: result.taskId,
          feedback: review.feedback,
        });
        this.clearIterations(result.taskId);
        result.status = "escalated";
        return result;
      }

      attempts++;
      feedbackHistory.push({ attempt: attempts, feedback: review.feedback });

      if (attempts >= maxAttempts) break;

      await task.onProgress?.(
        "brand_rejected",
        `:arrows_counterclockwise: Brand Agent underkände (${attempts}/${maxAttempts}) — omgenererar...`,
        {
          task_id: result.taskId,
          attempt: attempts,
          feedback: review.feedback,
        },
      );

      // Re-generate with Brand Agent feedback, preserving original intent
      this.logger.info(`Content Agent re-generating (attempt ${attempts + 1}): ${task.title}`, {
        agent: this.slug,
        task_id: result.taskId,
        action: "regenerate",
      });

      const feedbackSection = feedbackHistory.map((f) => `Försök ${f.attempt}: ${f.feedback}`).join("\n");

      const revisedInput = [
        "=== ORIGINALBEGÄRAN (MÅSTE BEVARAS) ===",
        task.input,
        "",
        "VIKTIGT: Du MÅSTE behålla ämnet, motivet och intentionen från originalbegäran ovan.",
        "Ändra ENBART det som Brand Agent-feedbacken kräver (tonalitet, formulering, varumärkesröst).",
        "Om du inte kan uppfylla originalbegäran inom varumärkesramarna, svara med exakt:",
        "INTENT_CONFLICT: [förklaring varför begäran inte kan uppfyllas inom varumärkesriktlinjerna]",
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

      const response = await this.callLLM(task.type, revisedInput, {
        tools: [CONTENT_RESPONSE_TOOL],
        toolChoice: { type: "tool", name: "content_response" },
      });

      // Extract structured response from tool use
      let responseText = response.text;
      let intentConflict = false;
      let conflictReason = "";

      if (response.toolUse && response.toolUse.toolName === "content_response") {
        const input = response.toolUse.input as {
          content: string;
          intent_conflict: boolean;
          conflict_description?: string;
        };
        responseText = input.content;
        intentConflict = input.intent_conflict;
        conflictReason = input.conflict_description ?? "";
      } else {
        // Fallback: check for legacy INTENT_CONFLICT prefix
        if (responseText.startsWith("INTENT_CONFLICT:")) {
          intentConflict = true;
          conflictReason = responseText.replace("INTENT_CONFLICT:", "").trim();
        }
      }

      // Check if Content Agent flagged an intent conflict
      if (intentConflict) {
        this.logger.warn(`Content Agent detected intent conflict: ${conflictReason}`, {
          agent: this.slug,
          task_id: result.taskId,
          action: "intent_conflict",
          status: "escalated",
        });

        await task.onProgress?.(
          "escalated",
          `:warning: Begäran kan inte uppfyllas inom varumärkesramarna — eskalerar till Orchestrator`,
          {
            task_id: result.taskId,
            feedback: conflictReason,
          },
        );

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
            `Begäran kan inte uppfyllas inom varumärkesramarna.\n\nOriginalbegäran: ${task.input}\n\nAnledning: ${conflictReason}`,
          );
        }

        this.clearIterations(result.taskId);
        result.status = "escalated";
        return result;
      }

      const totalTokens = response.tokensIn + response.tokensOut;
      const durationSec = (response.durationMs / 1000).toFixed(1);
      await task.onProgress?.(
        "llm_complete",
        `:white_check_mark: Omgenererat (${totalTokens} tokens, ${durationSec}s)`,
        {
          task_id: result.taskId,
          tokens: totalTokens,
          duration_ms: response.durationMs,
        },
      );

      accumulatedCostUsd += response.costUsd;
      const totalCostSek = usdToSek(accumulatedCostUsd, this.config.usdToSek);

      await updateTaskStatus(this.supabase, result.taskId, "awaiting_review", {
        content_json: {
          output: responseText,
          revision: attempts + 1,
          original_request: task.input,
        },
        model_used: response.model,
        tokens_used: response.tokensIn + response.tokensOut,
        cost_sek: totalCostSek,
      });

      result = {
        ...result,
        output: responseText,
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

    const taskId = task.existingTaskId
      ? task.existingTaskId
      : await createTask(this.supabase, {
          agent_id: agentRow,
          type: task.type,
          title: task.title,
          priority: task.priority ?? "normal",
          source: "gateway",
        });

    await updateTaskStatus(this.supabase, taskId, "in_progress", {
      sub_status: "generating",
    });

    await logActivity(this.supabase, {
      agent_id: agentRow,
      action: "task_started",
      details_json: { task_id: taskId, type: task.type },
    });

    try {
      await task.onProgress?.("image_generating", `:art: Content Agent genererar bild...`, {
        task_id: taskId,
      });

      const response = await routeImageRequest(this.config, this.logger, {
        prompt: task.input,
      });

      let imageBase64 = response.imageData.toString("base64");
      const costSek = usdToSek(response.costUsd, this.config.usdToSek);

      // Write cost metric (non-fatal)
      try {
        await writeMetric(this.supabase, {
          category: "cost",
          metric_name: "agent_cost_content",
          value: costSek,
          period: "daily",
          period_start: new Date().toISOString().slice(0, 10),
          metadata_json: { model: response.model, task_id: taskId, cost_usd: response.costUsd, type: "image" },
        });
      } catch (metricErr) {
        this.logger.warn(`Non-fatal: failed to write image cost metric: ${(metricErr as Error).message}`, {
          agent: this.slug,
          task_id: taskId,
          action: "metric_write_error",
        });
      }

      const durationSec = (response.durationMs / 1000).toFixed(1);
      await task.onProgress?.("image_generated", `:white_check_mark: Bild genererad (${durationSec}s)`, {
        task_id: taskId,
        cost_sek: costSek,
        duration_ms: response.durationMs,
      });

      await logActivity(this.supabase, {
        agent_id: agentRow,
        action: "image_generated",
        details_json: { task_id: taskId, cost_sek: costSek },
      });

      const complianceMode = this.resolveComplianceMode(task);

      // Open mode: skip brand review entirely — deliver image directly
      if (complianceMode === "open") {
        this.logger.info("Compliance mode 'open': skipping brand review for image", {
          agent: this.slug,
          task_id: taskId,
          action: "compliance_skip_image_review",
        });

        await updateTaskStatus(this.supabase, taskId, "completed", {
          content_json: {
            image_base64: imageBase64,
            mime_type: response.mimeType,
          },
          model_used: response.model,
          cost_sek: costSek,
        });

        return {
          taskId,
          output: `Image generated (${response.mimeType}) — brand review skipped (compliance: open)`,
          model: response.model,
          tokensIn: 0,
          tokensOut: 0,
          durationMs: response.durationMs,
          status: "completed",
        };
      }

      // Feature B: Brand Agent image review loop
      await updateTaskStatus(this.supabase, taskId, "awaiting_review", {
        content_json: {
          image_base64: imageBase64,
          mime_type: response.mimeType,
        },
        model_used: response.model,
        cost_sek: costSek,
      });

      const brandManifest = loadAgentManifest(this.config.knowledgeDir, "brand");
      const brandAgent = new BrandAgent(this.config, this.logger, this.supabase, brandManifest);

      let attempts = 0;
      // Balanced mode: only 1 review attempt (no re-generation loop)
      const maxAttempts = complianceMode === "balanced" ? 1 : this.manifest.escalation_threshold;

      while (attempts < maxAttempts) {
        this.checkMaxIterations(taskId);

        await task.onProgress?.(
          "brand_reviewing",
          `:mag: Brand Agent granskar bild${attempts > 0 ? ` (${attempts + 1}/${maxAttempts})` : ""}...`,
          { task_id: taskId, attempt: attempts + 1 },
        );

        const review = await brandAgent.review({
          taskId,
          agentSlug: this.slug,
          content: `Bildbegäran: ${task.input}`,
          taskType: task.type,
          imageBase64,
          imageMimeType: response.mimeType,
          complianceMode,
        });

        if (review.decision === "approved") {
          await task.onProgress?.("brand_approved", `:white_check_mark: Brand Agent godkände bilden`, {
            task_id: taskId,
          });
          this.clearIterations(taskId);

          return {
            taskId,
            output: `Image generated and approved (${response.mimeType})`,
            model: response.model,
            tokensIn: 0,
            tokensOut: 0,
            durationMs: response.durationMs,
            status: "completed",
          };
        }

        if (review.escalated) {
          await task.onProgress?.("escalated", `:warning: Eskalerar bildgranskning till Orchestrator`, {
            task_id: taskId,
            feedback: review.feedback,
          });
          this.clearIterations(taskId);

          return {
            taskId,
            output: "",
            model: response.model,
            tokensIn: 0,
            tokensOut: 0,
            durationMs: response.durationMs,
            status: "escalated",
          };
        }

        attempts++;
        if (attempts >= maxAttempts) break;

        // Re-generate image with brand feedback
        await task.onProgress?.(
          "brand_rejected",
          `:arrows_counterclockwise: Brand Agent underkände bild (${attempts}/${maxAttempts}) — omgenererar...`,
          { task_id: taskId, feedback: review.feedback },
        );

        this.logger.info(`Content Agent re-generating image (attempt ${attempts + 1}): ${task.title}`, {
          agent: this.slug,
          task_id: taskId,
          action: "regenerate_image",
        });

        const retryPrompt = [
          "--- ORIGINALBEGÄRAN ---",
          task.input,
          "",
          "--- FEEDBACK FRÅN BRAND AGENT ---",
          review.feedback,
          "",
          "Generera en ny bild som adresserar feedbacken ovan.",
        ].join("\n");

        await task.onProgress?.("image_regenerating", `:art: Omgenererar bild (${attempts + 1}/${maxAttempts})...`, {
          task_id: taskId,
          attempt: attempts + 1,
        });

        const retryResponse = await routeImageRequest(this.config, this.logger, {
          prompt: retryPrompt,
        });

        imageBase64 = retryResponse.imageData.toString("base64");

        await updateTaskStatus(this.supabase, taskId, "awaiting_review", {
          content_json: {
            image_base64: imageBase64,
            mime_type: retryResponse.mimeType,
          },
        });
      }

      // Exhausted attempts without approval
      this.clearIterations(taskId);
      return {
        taskId,
        output: "",
        model: response.model,
        tokensIn: 0,
        tokensOut: 0,
        durationMs: response.durationMs,
        status: "escalated",
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
