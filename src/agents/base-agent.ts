import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { AgentManifest, resolveAgentFiles } from "./agent-loader";
import { loadBrandContext } from "../context/context-manager";
import { buildSystemPrompt, buildTaskPrompt } from "../context/prompt-builder";
import { routeRequest, AgentRouting } from "../gateway/router";
import { LLMResponse } from "../llm/types";
import { createTask, updateTaskStatus, createApproval } from "../supabase/task-writer";
import { logActivity } from "../supabase/activity-writer";

export type ProgressCallback = (
  action: string,
  message: string,
  details?: Record<string, unknown>
) => Promise<void>;

export interface AgentTask {
  type: string;
  title: string;
  input: string;
  priority?: string;
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
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly slug: string;

  constructor(
    protected readonly config: AppConfig,
    protected readonly logger: Logger,
    protected readonly supabase: SupabaseClient,
    protected readonly manifest: AgentManifest
  ) {}

  protected getSystemPrompt(): string {
    const brandContext = loadBrandContext(this.config.knowledgeDir);
    const agentContext = resolveAgentFiles(
      this.config.knowledgeDir,
      this.slug,
      this.manifest.system_context
    );
    return buildSystemPrompt(brandContext, agentContext);
  }

  protected getTaskContext(taskType: string): string {
    const files = this.manifest.task_context[taskType];
    if (!files || files.length === 0) return "";
    return resolveAgentFiles(this.config.knowledgeDir, this.slug, files);
  }

  protected async callLLM(taskType: string, userPrompt: string): Promise<LLMResponse> {
    const systemPrompt = this.getSystemPrompt();
    const taskContext = this.getTaskContext(taskType);
    const fullPrompt = buildTaskPrompt(taskContext, userPrompt);

    return routeRequest(
      this.config,
      this.logger,
      this.manifest.routing as AgentRouting,
      taskType,
      { systemPrompt, userPrompt: fullPrompt }
    );
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this.logger.info(`${this.name} executing: ${task.title}`, {
      agent: this.slug,
      action: "task_start",
    });

    // Create task in Supabase
    const agentRow = await this.getAgentId();
    const taskId = await createTask(this.supabase, {
      agent_id: agentRow,
      type: task.type,
      title: task.title,
      priority: task.priority ?? "normal",
    });

    await updateTaskStatus(this.supabase, taskId, "in_progress");
    await logActivity(this.supabase, {
      agent_id: agentRow,
      action: "task_started",
      details_json: { task_id: taskId, type: task.type },
    });

    try {
      const routeAlias = (this.manifest.routing as Record<string, string>)[task.type]
        ?? (this.manifest.routing as Record<string, string>).default
        ?? "unknown";
      await task.onProgress?.("llm_calling", `:brain: ${this.name} anropar ${routeAlias}...`, {
        task_id: taskId,
        model: routeAlias,
        task_type: task.type,
      });

      const response = await this.callLLM(task.type, task.input);

      const durationSec = (response.durationMs / 1000).toFixed(1);
      const totalTokens = response.tokensIn + response.tokensOut;
      await task.onProgress?.("llm_complete", `:white_check_mark: Innehåll genererat (${totalTokens} tokens, ${durationSec}s)`, {
        task_id: taskId,
        model: response.model,
        tokens: totalTokens,
        duration_ms: response.durationMs,
      });

      await updateTaskStatus(this.supabase, taskId, "awaiting_review", {
        content_json: { output: response.text },
        model_used: response.model,
        tokens_used: totalTokens,
      });

      this.logger.info(`${this.name} completed: ${task.title}`, {
        agent: this.slug,
        task_id: taskId,
        action: "task_complete",
        model: response.model,
        tokens_in: response.tokensIn,
        tokens_out: response.tokensOut,
        duration_ms: response.durationMs,
        status: "success",
      });

      return {
        taskId,
        output: response.text,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
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
        action: "task_error",
        details_json: { task_id: taskId, error: message },
      });

      this.logger.error(`${this.name} failed: ${message}`, {
        agent: this.slug,
        task_id: taskId,
        action: "task_error",
        status: "error",
        error: message,
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

  protected async getAgentId(): Promise<string> {
    const { data, error } = await this.supabase
      .from("agents")
      .select("id")
      .eq("slug", this.slug)
      .single();

    if (error || !data) throw new Error(`Agent '${this.slug}' not found in database`);
    return data.id;
  }

  protected async writeMemory(relativePath: string, data: unknown): Promise<void> {
    if (!this.manifest.writable.includes(relativePath)) {
      throw new Error(`Agent ${this.slug} cannot write to ${relativePath}`);
    }

    const fullPath = path.join(
      this.config.knowledgeDir,
      "agents",
      this.slug,
      relativePath
    );

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf-8");
  }
}
