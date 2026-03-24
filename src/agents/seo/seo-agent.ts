import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";

export class SeoAgent extends BaseAgent {
  readonly name = "SEO Agent";
  readonly slug = "seo";

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const result = await super.execute(task);

    if ((result.status === "awaiting_review" || result.status === "completed") && task.type === "keyword_research") {
      await this.saveKeywordRankings(result.taskId, result.output);
    }

    return result;
  }

  private async saveKeywordRankings(taskId: string, output: string): Promise<void> {
    try {
      const memoryPath = "memory/keyword-rankings.json";
      let rankings: Array<{
        timestamp: string;
        taskId: string;
        data: string;
      }> = [];

      const fullPath = `${this.config.knowledgeDir}/agents/${this.slug}/${memoryPath}`;
      if (fs.existsSync(fullPath)) {
        try {
          rankings = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        } catch {
          // Start fresh
        }
      }

      rankings.push({
        timestamp: new Date().toISOString(),
        taskId,
        data: output,
      });

      if (rankings.length > 50) {
        rankings = rankings.slice(-50);
      }

      await this.writeMemory(memoryPath, rankings);
    } catch (err) {
      this.logger.error(`Failed to save keyword rankings: ${(err as Error).message}`, {
        agent: this.slug,
        action: "memory_write_error",
      });
    }
  }
}
