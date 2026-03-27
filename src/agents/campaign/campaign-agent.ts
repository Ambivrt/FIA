import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { logActivity } from "../../supabase/activity-writer";

export class CampaignAgent extends BaseAgent {
  readonly name = "Campaign Agent";
  readonly slug = "campaign";

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const complianceMode = this.resolveComplianceMode(task);

    // Budget enforcement (skipped in open mode)
    if (complianceMode !== "open" && this.manifest.budget_limit_sek) {
      const spent = await this.getMonthlySpending();
      if (spent >= this.manifest.budget_limit_sek) {
        await this.pauseWithBudgetWarning(spent);
        const agentRow = await this.getAgentId();
        const { createTask, updateTaskStatus } = await import("../../supabase/task-writer");
        const taskId = task.existingTaskId
          ? task.existingTaskId
          : await createTask(this.supabase, {
              agent_id: agentRow,
              type: task.type,
              title: task.title,
              priority: task.priority ?? "normal",
              source: "gateway",
            });
        await updateTaskStatus(this.supabase, taskId, "error", {
          content_json: { error: `Budget exceeded: ${spent.toFixed(2)} / ${this.manifest.budget_limit_sek} SEK` },
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

    if (task.type === "ab_variants") {
      return this.generateAbVariants(task);
    }

    return super.execute(task);
  }

  private async getMonthlySpending(): Promise<number> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const agentRow = await this.getAgentId();
    const { data } = await this.supabase
      .from("tasks")
      .select("cost_sek")
      .eq("agent_id", agentRow)
      .gte("created_at", monthStart.toISOString())
      .not("cost_sek", "is", null);

    return (data ?? []).reduce((sum: number, t: { cost_sek: number | null }) => sum + (t.cost_sek ?? 0), 0);
  }

  private async pauseWithBudgetWarning(spent: number): Promise<void> {
    const limit = this.manifest.budget_limit_sek!;

    // Pause agent in Supabase
    await this.supabase.from("agents").update({ status: "paused" }).eq("slug", this.slug);

    await logActivity(this.supabase, {
      agent_id: await this.getAgentId(),
      action: "budget_exceeded",
      details_json: { spent_sek: spent, limit_sek: limit },
    });

    this.logger.warn(`Campaign Agent paused: budget exceeded (${spent.toFixed(2)} / ${limit} SEK)`, {
      agent: this.slug,
      action: "budget_exceeded",
      status: "error",
    });

    // Notify via Slack
    try {
      const { getSlackApp } = await import("../../slack/app");
      const slackApp = getSlackApp();
      if (slackApp) {
        const { CHANNELS } = await import("../../slack/channels");
        await slackApp.client.chat.postMessage({
          channel: CHANNELS.campaigns,
          text: `:warning: *Campaign Agent pausad — budget överskriden*\nFörbrukat: ${spent.toFixed(2)} SEK / ${limit} SEK\nÅterstarta med \`/fia resume\` efter budgetjustering.`,
        });
      }
    } catch {
      // Non-critical
    }
  }

  private async generateAbVariants(task: AgentTask): Promise<AgentResult> {
    const abPrompt = [
      task.input,
      "",
      "Generera exakt 2 varianter (A och B) med tydliga skillnader.",
      "Markera varianterna med --- VARIANT A --- och --- VARIANT B ---.",
      "Beskriv efter varianterna vilken hypotes varje variant testar.",
    ].join("\n");

    const modifiedTask: AgentTask = { ...task, input: abPrompt };
    const result = await super.execute(modifiedTask);

    if (result.status === "awaiting_review" || result.status === "completed") {
      await this.saveAbTestResult(result.taskId, result.output);
    }

    return result;
  }

  private async saveAbTestResult(taskId: string, output: string): Promise<void> {
    try {
      const memoryPath = "memory/ab-test-results.json";
      let results: Array<{
        timestamp: string;
        taskId: string;
        variants: string;
      }> = [];

      const fullPath = `${this.config.knowledgeDir}/agents/${this.slug}/${memoryPath}`;
      if (fs.existsSync(fullPath)) {
        try {
          results = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        } catch {
          // Start fresh
        }
      }

      results.push({
        timestamp: new Date().toISOString(),
        taskId,
        variants: output,
      });

      if (results.length > 50) {
        results = results.slice(-50);
      }

      await this.writeMemory(memoryPath, results);
    } catch (err) {
      this.logger.error(`Failed to save A/B test result: ${(err as Error).message}`, {
        agent: this.slug,
        action: "memory_write_error",
      });
    }
  }
}
