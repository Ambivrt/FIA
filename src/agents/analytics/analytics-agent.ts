import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { AgentManifest } from "../agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../base-agent";
import { writeMetric } from "../../supabase/metrics-writer";

export class AnalyticsAgent extends BaseAgent {
  readonly name = "Analytics Agent";
  readonly slug = "analytics";

  constructor(config: AppConfig, logger: Logger, supabase: SupabaseClient, manifest: AgentManifest) {
    super(config, logger, supabase, manifest);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    // Use report_writing routing for weekly/quarterly reports (maps to claude-opus)
    const effectiveType = this.getEffectiveTaskType(task.type);
    const result = await super.execute({ ...task, type: effectiveType });

    if (result.status === "awaiting_review" || result.status === "completed") {
      await this.extractAndWriteMetrics(task.type, result.output);
    }

    return result;
  }

  private getEffectiveTaskType(taskType: string): string {
    // Map report tasks to report_writing routing for claude-opus
    if (taskType === "weekly_report" || taskType === "quarterly_review") {
      return "report_writing";
    }
    if (taskType === "morning_pulse") {
      return "insights";
    }
    return taskType;
  }

  private async extractAndWriteMetrics(taskType: string, output: string): Promise<void> {
    try {
      // Try to extract structured metrics from LLM output
      const metricsMatch = output.match(/```json\s*([\s\S]*?)```/);
      if (!metricsMatch) return;

      const parsed = JSON.parse(metricsMatch[1]);
      if (!Array.isArray(parsed)) return;

      const today = new Date().toISOString().split("T")[0];
      const period =
        taskType === "quarterly_review"
          ? ("monthly" as const)
          : taskType === "weekly_report"
            ? ("weekly" as const)
            : ("daily" as const);

      for (const item of parsed) {
        if (item.metric_name && item.value !== undefined && item.category) {
          await writeMetric(this.supabase, {
            category: item.category,
            metric_name: item.metric_name,
            value: item.value,
            period,
            period_start: today,
            metadata_json: item.metadata ?? {},
          });
        }
      }

      this.logger.info(`Analytics wrote ${parsed.length} metrics`, {
        agent: this.slug,
        action: "metrics_written",
      });
    } catch {
      // Metrics extraction is best-effort
      this.logger.debug("No structured metrics found in output", {
        agent: this.slug,
        action: "metrics_extraction_skipped",
      });
    }
  }
}
