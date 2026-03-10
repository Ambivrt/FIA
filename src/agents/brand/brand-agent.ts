import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent } from "../base-agent";
import { createApproval, updateTaskStatus } from "../../supabase/task-writer";
import { logActivity } from "../../supabase/activity-writer";
import { getSlackApp } from "../../slack/app";
import { sendEscalation } from "../../slack/handlers";

export interface ReviewRequest {
  taskId: string;
  agentSlug: string;
  content: string;
  taskType: string;
}

export interface ReviewResult {
  decision: "approved" | "rejected" | "revision_requested";
  feedback: string;
  escalated: boolean;
}

export class BrandAgent extends BaseAgent {
  readonly name = "Brand Agent";
  readonly slug = "brand";

  private rejectionCounts = new Map<string, number>();

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
      "Granska följande innehåll för varumärkesöverensstämmelse.",
      "Kontrollera: tonalitet, budskapshierarki, visuella riktlinjer och Forefronts varumärkesvärden.",
      'Svara med ett JSON-objekt: { "decision": "approved" | "rejected" | "revision_requested", "feedback": "..." }',
      "",
      `Innehållstyp: ${request.taskType}`,
      `Källagent: ${request.agentSlug}`,
      "",
      "--- INNEHÅLL ATT GRANSKA ---",
      request.content,
    ].join("\n");

    const response = await this.callLLM("default", prompt);

    let parsed: { decision: string; feedback: string };
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { decision: "revision_requested", feedback: response.text };
    } catch {
      parsed = { decision: "revision_requested", feedback: response.text };
    }

    const decision = parsed.decision as ReviewResult["decision"];
    const feedback = parsed.feedback;

    // Track rejections per task
    if (decision !== "approved") {
      const count = (this.rejectionCounts.get(request.taskId) ?? 0) + 1;
      this.rejectionCounts.set(request.taskId, count);

      await this.writeRejectionPattern(request, feedback);

      // Escalate after threshold
      if (count >= this.manifest.escalation_threshold) {
        this.rejectionCounts.delete(request.taskId);
        await this.escalateToOrchestrator(request.taskId, request.agentSlug, feedback);
        return { decision, feedback, escalated: true };
      }
    } else {
      this.rejectionCounts.delete(request.taskId);
    }

    // Write approval record to Supabase
    const agentId = await this.getAgentId();
    await createApproval(this.supabase, {
      task_id: request.taskId,
      reviewer_type: "brand_agent",
      decision,
      feedback,
    });

    if (decision === "approved") {
      await updateTaskStatus(this.supabase, request.taskId, "approved");
    } else {
      await updateTaskStatus(this.supabase, request.taskId, "rejected");
    }

    await logActivity(this.supabase, {
      agent_id: agentId,
      action: `review_${decision}`,
      details_json: {
        task_id: request.taskId,
        source_agent: request.agentSlug,
        feedback,
      },
    });

    this.logger.info(`Brand review: ${decision}`, {
      agent: this.slug,
      task_id: request.taskId,
      action: `review_${decision}`,
      model: response.model,
      brand_review: decision === "revision_requested" ? "rejected" : decision,
      tokens_in: response.tokensIn,
      tokens_out: response.tokensOut,
      duration_ms: response.durationMs,
      status: "success",
    });

    return { decision, feedback, escalated: false };
  }

  private async escalateToOrchestrator(
    taskId: string,
    sourceAgent: string,
    lastFeedback: string
  ): Promise<void> {
    const agentId = await this.getAgentId();

    await updateTaskStatus(this.supabase, taskId, "awaiting_review");
    await createApproval(this.supabase, {
      task_id: taskId,
      reviewer_type: "brand_agent",
      decision: "rejected",
      feedback: `ESKALERING: ${this.manifest.escalation_threshold} avslag i rad. Senaste feedback: ${lastFeedback}`,
    });

    await logActivity(this.supabase, {
      agent_id: agentId,
      action: "escalated",
      details_json: {
        task_id: taskId,
        source_agent: sourceAgent,
        reason: `${this.manifest.escalation_threshold} consecutive rejections`,
        last_feedback: lastFeedback,
      },
    });

    this.logger.warn(`Brand Agent escalating task ${taskId} to Orchestrator`, {
      agent: this.slug,
      task_id: taskId,
      action: "escalated",
      status: "escalated",
    });

    // Notify Orchestrator via Slack
    const slackApp = getSlackApp();
    if (slackApp) {
      await sendEscalation(
        slackApp,
        this.logger,
        sourceAgent,
        taskId,
        `${this.manifest.escalation_threshold} avslag i rad. Senaste feedback: ${lastFeedback}`
      );
    }
  }

  private async writeRejectionPattern(
    request: ReviewRequest,
    feedback: string
  ): Promise<void> {
    try {
      const memoryPath = "memory/rejection-patterns.json";
      let patterns: Array<{
        timestamp: string;
        taskId: string;
        sourceAgent: string;
        taskType: string;
        feedback: string;
      }> = [];

      const fullPath = `${this.config.knowledgeDir}/agents/${this.slug}/${memoryPath}`;
      if (fs.existsSync(fullPath)) {
        try {
          patterns = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        } catch {
          // Start fresh if file is invalid
        }
      }

      patterns.push({
        timestamp: new Date().toISOString(),
        taskId: request.taskId,
        sourceAgent: request.agentSlug,
        taskType: request.taskType,
        feedback,
      });

      // Keep last 100 patterns
      if (patterns.length > 100) {
        patterns = patterns.slice(-100);
      }

      await this.writeMemory(memoryPath, patterns);
    } catch (err) {
      this.logger.error(`Failed to write rejection pattern: ${(err as Error).message}`, {
        agent: this.slug,
        action: "memory_write_error",
      });
    }
  }
}
