import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { AgentManifest, resolveAgentFiles, loadSkills } from "./agent-loader";
import { loadBrandContext } from "../context/context-manager";
import { buildSystemPrompt, buildTaskPrompt } from "../context/prompt-builder";
import {
  fetchAgentSkills,
  fetchSystemContext,
  fetchTaskContext as fetchTaskCtxFromDb,
} from "../knowledge/knowledge-reader";
import { routeRequest, AgentRouting } from "../gateway/router";
import { LLMResponse, ToolDefinition, PipelineData } from "../llm/types";
import { createTask, updateTaskStatus, createApproval } from "../supabase/task-writer";
import { logActivity } from "../supabase/activity-writer";
import { writeMetric } from "../supabase/metrics-writer";
import { usdToSek } from "../llm/pricing";
import { runSelfEval } from "./self-eval";
import { buildToolDefinitions, dispatchToolUse, hasTools } from "../mcp/tool-registry";

export type ProgressCallback = (action: string, message: string, details?: Record<string, unknown>) => Promise<void>;

export interface AgentTask {
  type: string;
  title: string;
  input: string;
  priority?: string;
  /** If set, reuse an existing task row instead of creating a new one (e.g. Dashboard-created tasks). */
  existingTaskId?: string;
  /** Correlation ID for tracing multi-agent flows through logs. */
  correlationId?: string;
  onProgress?: ProgressCallback;
}

export interface AgentResult {
  taskId: string;
  output: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  status: "completed" | "escalated" | "error";
  pipeline?: PipelineData;
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly slug: string;

  /** Tracks iteration count per task to enforce max_iterations. */
  private iterationCounts = new Map<string, number>();

  constructor(
    protected readonly config: AppConfig,
    protected readonly logger: Logger,
    protected readonly supabase: SupabaseClient,
    protected readonly manifest: AgentManifest,
  ) {}

  protected async getSystemPrompt(): Promise<string> {
    // Try Supabase first, fall back to disk
    try {
      const skills = await fetchAgentSkills(this.supabase, this.slug);
      if (skills.length > 0) {
        const systemCtx = await fetchSystemContext(this.supabase, this.slug);
        const brandContext = loadBrandContext(this.config.knowledgeDir);
        return buildSystemPrompt(brandContext, skills, systemCtx || undefined);
      }
    } catch (err) {
      this.logger.warn(`Supabase knowledge fetch failed, falling back to disk: ${(err as Error).message}`, {
        agent: this.slug,
        action: "knowledge_fallback",
      });
    }

    // Disk fallback
    const brandContext = loadBrandContext(this.config.knowledgeDir);
    const skills = loadSkills(this.config.knowledgeDir, this.slug, this.manifest);
    const extraFiles = this.manifest.system_context.filter((f) => f !== "SKILL.md");
    const extraContext = resolveAgentFiles(this.config.knowledgeDir, this.slug, extraFiles);
    return buildSystemPrompt(brandContext, skills, extraContext || undefined);
  }

  protected async getTaskContext(taskType: string): Promise<string> {
    // Try Supabase first, fall back to disk
    try {
      const dbContext = await fetchTaskCtxFromDb(this.supabase, this.slug, taskType);
      if (dbContext) return dbContext;
    } catch {
      // Fall through to disk
    }

    const files = this.manifest.task_context[taskType];
    if (!files || files.length === 0) return "";
    return resolveAgentFiles(this.config.knowledgeDir, this.slug, files);
  }

  protected async callLLM(
    taskType: string,
    userPrompt: string,
    options?: {
      tools?: ToolDefinition[];
      toolChoice?: { type: "auto" | "any" | "tool"; name?: string };
    },
  ): Promise<LLMResponse> {
    const systemPrompt = await this.getSystemPrompt();
    const taskContext = await this.getTaskContext(taskType);
    const fullPrompt = buildTaskPrompt(taskContext, userPrompt);

    return routeRequest(this.config, this.logger, this.manifest.routing as AgentRouting, taskType, {
      systemPrompt,
      userPrompt: fullPrompt,
      tools: options?.tools,
      toolChoice: options?.toolChoice,
    });
  }

  /**
   * Call LLM with manifest-defined tools (GWS, etc.) and handle tool_use loop.
   * If the LLM requests a tool, executes it and feeds the result back for a final response.
   */
  protected async callLLMWithTools(taskType: string, userPrompt: string): Promise<LLMResponse> {
    if (!hasTools(this.manifest.tools)) {
      return this.callLLM(taskType, userPrompt);
    }

    const toolDefs = await buildToolDefinitions(this.manifest.tools);
    if (toolDefs.length === 0) {
      return this.callLLM(taskType, userPrompt);
    }

    this.logger.info(`${this.name}: ${toolDefs.length} GWS tools available`, {
      agent: this.slug,
      action: "tools_loaded",
      tool_count: toolDefs.length,
      tools: toolDefs.map((t) => t.name),
    });

    const response = await this.callLLM(taskType, userPrompt, {
      tools: toolDefs,
      toolChoice: { type: "auto" },
    });

    // If LLM didn't request a tool, return as-is
    if (!response.toolUse) {
      return response;
    }

    // Execute the tool and feed result back to LLM
    this.logger.info(`${this.name}: executing tool ${response.toolUse.toolName}`, {
      agent: this.slug,
      action: "tool_use",
      tool: response.toolUse.toolName,
      input: response.toolUse.input,
    });

    const toolResult = await dispatchToolUse(response.toolUse, this.config);

    // Call LLM again with tool result
    const followUp = await this.callLLM(
      taskType,
      [userPrompt, "", `## Tool Result (${response.toolUse.toolName})`, toolResult].join("\n"),
    );

    // Accumulate token counts
    return {
      ...followUp,
      tokensIn: response.tokensIn + followUp.tokensIn,
      tokensOut: response.tokensOut + followUp.tokensOut,
      costUsd: response.costUsd + followUp.costUsd,
      durationMs: response.durationMs + followUp.durationMs,
    };
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const cid = task.correlationId;
    this.logger.info(`${this.name} executing: ${task.title}`, {
      agent: this.slug,
      action: "task_start",
      correlation_id: cid,
    });

    // Reuse existing task row (Dashboard) or create new one (gateway)
    const agentRow = await this.getAgentId();
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

    try {
      const routeAlias = this.getRouteAlias(task.type);
      await task.onProgress?.("llm_calling", `:brain: ${this.name} anropar ${routeAlias}...`, {
        task_id: taskId,
        model: routeAlias,
        task_type: task.type,
      });

      const response = await this.callLLMWithTools(task.type, task.input);

      const durationSec = (response.durationMs / 1000).toFixed(1);
      const generationTokens = response.tokensIn + response.tokensOut;
      await task.onProgress?.(
        "llm_complete",
        `:white_check_mark: Innehåll genererat (${generationTokens} tokens, ${durationSec}s)`,
        {
          task_id: taskId,
          model: response.model,
          tokens: generationTokens,
          duration_ms: response.durationMs,
        },
      );

      // Build pipeline data
      const pipeline: PipelineData = {
        generation: {
          model: response.model,
          tokens_in: response.tokensIn,
          tokens_out: response.tokensOut,
        },
      };

      // --- Self-eval ---
      let finalOutput = response.text;
      let accumulatedTokensIn = response.tokensIn;
      let accumulatedTokensOut = response.tokensOut;
      let accumulatedCostUsd = response.costUsd;
      let accumulatedDurationMs = response.durationMs;

      const selfEvalResult = await this.runSelfEvalIfEnabled(finalOutput, taskId, task, pipeline);
      const selfEvalThreshold = this.manifest.self_eval?.threshold ?? 0.7;

      if (selfEvalResult && selfEvalResult.score < selfEvalThreshold) {
        if (selfEvalResult.score <= 0.4) {
          // Very poor quality – mark as error
          await updateTaskStatus(this.supabase, taskId, "error", {
            content_json: { output: finalOutput, _pipeline: pipeline, error: "Self-eval score too low" },
          });

          await logActivity(this.supabase, {
            agent_id: agentRow,
            action: "self_eval_error",
            details_json: { task_id: taskId, score: selfEvalResult.score, issues: selfEvalResult.issues },
          });

          this.logger.warn(`${this.name} self-eval too low (${selfEvalResult.score}): ${task.title}`, {
            agent: this.slug,
            task_id: taskId,
            action: "self_eval_error",
            score: selfEvalResult.score,
          });

          this.clearIterations(taskId);
          return {
            taskId,
            output: finalOutput,
            model: response.model,
            tokensIn: accumulatedTokensIn,
            tokensOut: accumulatedTokensOut,
            durationMs: accumulatedDurationMs,
            status: "error",
            pipeline,
          };
        }

        // Score > 0.4 but below threshold – one revision attempt
        await task.onProgress?.(
          "self_eval_revision",
          `:arrows_counterclockwise: Self-eval identifierade brister — omgenererar...`,
          {
            task_id: taskId,
            issues: selfEvalResult.issues,
          },
        );

        const revisionPrompt = [
          "Förbättra följande text baserat på feedbacken nedan.",
          "",
          "## Feedback",
          ...selfEvalResult.issues.map((i) => `- ${i}`),
          "",
          "## Originaltext",
          finalOutput,
        ].join("\n");

        const revision = await this.callLLM(task.type, revisionPrompt);
        finalOutput = revision.text;
        accumulatedTokensIn += revision.tokensIn;
        accumulatedTokensOut += revision.tokensOut;
        accumulatedCostUsd += revision.costUsd;
        accumulatedDurationMs += revision.durationMs;

        pipeline.self_eval!.revision_triggered = true;
      }

      const costSek = usdToSek(accumulatedCostUsd, this.config.usdToSek);

      const totalAccumulatedTokens = accumulatedTokensIn + accumulatedTokensOut;

      await updateTaskStatus(this.supabase, taskId, "awaiting_review", {
        content_json: { output: finalOutput, _pipeline: pipeline },
        model_used: response.model,
        tokens_used: totalAccumulatedTokens,
        cost_sek: costSek,
      });

      // Write cost metric (non-fatal – must not block task completion)
      try {
        await writeMetric(this.supabase, {
          category: "cost",
          metric_name: `agent_cost_${this.slug}`,
          value: costSek,
          period: "daily",
          period_start: new Date().toISOString().slice(0, 10),
          metadata_json: { model: response.model, task_id: taskId, cost_usd: accumulatedCostUsd },
        });
      } catch (metricErr) {
        this.logger.warn(`Non-fatal: failed to write cost metric: ${(metricErr as Error).message}`, {
          agent: this.slug,
          task_id: taskId,
          action: "metric_write_error",
        });
      }

      this.logger.info(`${this.name} completed: ${task.title}`, {
        agent: this.slug,
        task_id: taskId,
        action: "task_complete",
        correlation_id: cid,
        model: response.model,
        tokens_in: accumulatedTokensIn,
        tokens_out: accumulatedTokensOut,
        cost_usd: accumulatedCostUsd,
        duration_ms: accumulatedDurationMs,
        status: "success",
      });

      this.clearIterations(taskId);
      return {
        taskId,
        output: finalOutput,
        model: response.model,
        tokensIn: accumulatedTokensIn,
        tokensOut: accumulatedTokensOut,
        durationMs: accumulatedDurationMs,
        status: "completed",
        pipeline,
      };
    } catch (err) {
      const message = (err as Error).message;
      try {
        await updateTaskStatus(this.supabase, taskId, "error", {
          content_json: { error: message },
        });

        await logActivity(this.supabase, {
          agent_id: agentRow,
          action: "task_error",
          details_json: { task_id: taskId, error: message },
        });
      } catch (updateErr) {
        this.logger.error(`Failed to write error status for task ${taskId}: ${(updateErr as Error).message}`, {
          agent: this.slug,
          task_id: taskId,
          action: "task_error_write_failed",
        });
      }

      this.logger.error(`${this.name} failed: ${message}`, {
        agent: this.slug,
        task_id: taskId,
        action: "task_error",
        correlation_id: cid,
        status: "error",
        error: message,
      });

      await task.onProgress?.("error", `:x: ${this.name} misslyckades: ${message}`, {
        task_id: taskId,
        error: message,
      });

      this.clearIterations(taskId);
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

  private async runSelfEvalIfEnabled(
    output: string,
    taskId: string,
    task: AgentTask,
    pipeline: PipelineData,
  ): Promise<{ pass: boolean; score: number; issues: string[] } | null> {
    const selfEvalConfig = this.manifest.self_eval;
    if (!selfEvalConfig?.enabled) return null;

    try {
      await task.onProgress?.("self_eval", `:mag: Self-eval körs...`, { task_id: taskId });

      const result = await runSelfEval(this.config, this.logger, this.slug, output, selfEvalConfig);

      pipeline.self_eval = {
        ...result,
        revision_triggered: false,
        model: selfEvalConfig.model,
      };

      this.logger.info(`Self-eval: score=${result.score}, pass=${result.pass}`, {
        action: "self_eval",
        agent: this.slug,
        task_id: taskId,
        model: selfEvalConfig.model,
        score: result.score,
        issues: result.issues,
      });

      return result;
    } catch (err) {
      // Self-eval failure is non-fatal – log and continue
      this.logger.warn(`Self-eval failed, continuing without: ${(err as Error).message}`, {
        action: "self_eval_error",
        agent: this.slug,
        task_id: taskId,
      });
      return null;
    }
  }

  private getRouteAlias(taskType: string): string {
    const entry =
      (this.manifest.routing as Record<string, unknown>)[taskType] ??
      (this.manifest.routing as Record<string, unknown>).default;
    if (typeof entry === "string") return entry;
    if (typeof entry === "object" && entry !== null && "primary" in entry) {
      return (entry as { primary: string }).primary;
    }
    return "unknown";
  }

  /**
   * Increment and check the iteration count for a task.
   * Throws if max_iterations is exceeded, which will be caught by execute()'s try/catch.
   */
  protected checkMaxIterations(taskId: string): void {
    const maxIterations = this.manifest.max_iterations ?? 5;
    const count = (this.iterationCounts.get(taskId) ?? 0) + 1;
    this.iterationCounts.set(taskId, count);

    if (count > maxIterations) {
      this.iterationCounts.delete(taskId);
      throw new Error(
        `Max iterations (${maxIterations}) exceeded for task ${taskId}. ` +
          `Marking as error to prevent infinite loops.`,
      );
    }
  }

  /** Clear iteration tracking for a completed/failed task. */
  protected clearIterations(taskId: string): void {
    this.iterationCounts.delete(taskId);
  }

  protected async getAgentId(): Promise<string> {
    const { data, error } = await this.supabase.from("agents").select("id").eq("slug", this.slug).single();

    if (error || !data) throw new Error(`Agent '${this.slug}' not found in database`);
    return data.id;
  }

  protected async writeMemory(relativePath: string, data: unknown): Promise<void> {
    if (!this.manifest.writable.includes(relativePath)) {
      throw new Error(`Agent ${this.slug} cannot write to ${relativePath}`);
    }

    const fullPath = path.join(this.config.knowledgeDir, "agents", this.slug, relativePath);

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf-8");
  }
}
