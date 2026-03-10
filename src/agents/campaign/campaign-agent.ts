import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";

export class CampaignAgent extends BaseAgent {
  readonly name = "Campaign Agent";
  readonly slug = "campaign";

  constructor(
    config: AppConfig,
    logger: Logger,
    supabase: SupabaseClient,
    manifest: AgentManifest
  ) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (task.type === "ab_variants") {
      return this.generateAbVariants(task);
    }

    return super.execute(task);
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

    if (result.status === "completed") {
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
