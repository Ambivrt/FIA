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
import { ToolDefinition } from "../../llm/types";

const BRAND_REVIEW_TOOL: ToolDefinition = {
  name: "brand_review_decision",
  description: "Submit brand review decision for the content being reviewed",
  input_schema: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["approved", "rejected", "revision_requested"],
        description: "The review decision",
      },
      feedback: {
        type: "string",
        description: "Detailed feedback explaining the decision",
      },
    },
    required: ["decision", "feedback"],
  },
};

export interface ReviewRequest {
  taskId: string;
  agentSlug: string;
  content: string;
  taskType: string;
  correlationId?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ReviewResult {
  decision: "approved" | "rejected" | "revision_requested";
  feedback: string;
  escalated: boolean;
}

export class BrandAgent extends BaseAgent {
  readonly name = "Brand Agent";
  readonly slug = "brand";

  private static readonly STALE_ENTRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private rejectionCounts = new Map<string, { count: number; lastSeen: number }>();

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
    super(config, logger, supabase, manifest);
  }

  private cleanupStaleEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.rejectionCounts) {
      if (now - entry.lastSeen > BrandAgent.STALE_ENTRY_MS) {
        this.rejectionCounts.delete(key);
      }
    }
  }

  async review(request: ReviewRequest): Promise<ReviewResult> {
    this.cleanupStaleEntries();

    let response;

    if (request.imageBase64) {
      // Visual brand review — multimodal (image + text → Claude Vision)
      const prompt = [
        "Granska följande bild för visuell varumärkesöverensstämmelse med Forefronts visuella identitet.",
        "",
        "## Granska mot dessa kriterier:",
        "1. **Färgpalett** — Harmonierar med Forefronts organiska färger (#7D5365, #42504E, #555977, #756256, #7E7C83) eller gradient (#FF6B0B → #FFB7F8 → #79F2FB)? Inga klashande eller off-brand färger?",
        "2. **Bildspråk** — Autentisk känsla (inte stockfoto)? Människor i teknikkontext om relevant?",
        "3. **Komposition** — Ljus, luftig komposition? Organiska former som komplement till tech?",
        "4. **Varumärkespassning** — Speglar Forefronts karaktär: Modiga, Hängivna, Lustfyllda?",
        "5. **Typografi** — Om text förekommer i bilden: följer Manrope-standarden?",
        "",
        `Bildbegäran: ${request.content}`,
        `Innehållstyp: ${request.taskType}`,
        `Källagent: ${request.agentSlug}`,
        "",
        "Använd verktyget brand_review_decision för att lämna ditt beslut.",
        "Vid avslag, var specifik om vilka visuella element som behöver ändras.",
      ].join("\n");

      response = await this.callLLMWithImages("default", prompt, {
        images: [{ data: request.imageBase64, mediaType: request.imageMimeType || "image/png" }],
        tools: [BRAND_REVIEW_TOOL],
        toolChoice: { type: "tool", name: "brand_review_decision" },
      });
    } else {
      // Text brand review (unchanged)
      const prompt = [
        "Granska följande innehåll för varumärkesöverensstämmelse.",
        "Kontrollera: tonalitet, budskapshierarki, visuella riktlinjer och Forefronts varumärkesvärden.",
        "Använd verktyget brand_review_decision för att lämna ditt beslut.",
        "",
        `Innehållstyp: ${request.taskType}`,
        `Källagent: ${request.agentSlug}`,
        "",
        "--- INNEHÅLL ATT GRANSKA ---",
        request.content,
      ].join("\n");

      response = await this.callLLM("default", prompt, {
        tools: [BRAND_REVIEW_TOOL],
        toolChoice: { type: "tool", name: "brand_review_decision" },
      });
    }

    let decision: ReviewResult["decision"];
    let feedback: string;

    if (response.toolUse && response.toolUse.toolName === "brand_review_decision") {
      const input = response.toolUse.input as { decision: string; feedback: string };
      decision = input.decision as ReviewResult["decision"];
      feedback = input.feedback;
    } else {
      // Fallback: try to parse JSON from text response
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { decision: "revision_requested", feedback: response.text };
        decision = parsed.decision as ReviewResult["decision"];
        feedback = parsed.feedback;
      } catch {
        decision = "revision_requested";
        feedback = response.text;
      }
    }

    // Track rejections per task
    if (decision !== "approved") {
      const existing = this.rejectionCounts.get(request.taskId);
      const count = (existing?.count ?? 0) + 1;
      this.rejectionCounts.set(request.taskId, { count, lastSeen: Date.now() });

      await this.writeRejectionPattern(request, feedback);

      // Escalate after threshold
      if (count >= this.manifest.escalation_threshold) {
        this.rejectionCounts.delete(request.taskId);
        await this.escalateToOrchestrator(request.taskId, request.agentSlug, feedback, request.correlationId);
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
      correlation_id: request.correlationId,
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
    lastFeedback: string,
    correlationId?: string,
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
      correlation_id: correlationId,
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
        `${this.manifest.escalation_threshold} avslag i rad. Senaste feedback: ${lastFeedback}`,
      );
    }
  }

  private async writeRejectionPattern(request: ReviewRequest, feedback: string): Promise<void> {
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
