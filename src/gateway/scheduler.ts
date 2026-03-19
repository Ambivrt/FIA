import cron from "node-cron";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "./logger";
import { KillSwitch } from "../utils/kill-switch";
import { TaskQueue } from "./task-queue";
import { logActivity } from "../supabase/activity-writer";
import { createAgent } from "../agents/agent-factory";
import { getSlackApp } from "../slack/app";
import { CHANNELS } from "../slack/channels";
import { ProgressCallback } from "../agents/base-agent";
import { LLMError, AgentError } from "../utils/errors";

interface ScheduleEntry {
  expression: string;
  agent: string;
  task: string;
  description: string;
}

/** Map agent slug to the Slack channel for progress messages */
const AGENT_CHANNEL: Record<string, string> = {
  content: CHANNELS.content,
  campaign: CHANNELS.campaigns,
  analytics: CHANNELS.analytics,
  strategy: CHANNELS.orchestrator,
  lead: CHANNELS.orchestrator,
  seo: CHANNELS.orchestrator,
  brand: CHANNELS.orchestrator,
};

export const SCHEDULE: ScheduleEntry[] = [
  { expression: "0 7 * * 1-5", agent: "analytics", task: "morning_pulse", description: "Analytics morgonpuls" },
  { expression: "0 8 * * 1", agent: "strategy", task: "weekly_planning", description: "Strategy veckoplanering" },
  {
    expression: "0 9 * * 1,3,5",
    agent: "content",
    task: "scheduled_content",
    description: "Content schemalagt innehåll",
  },
  { expression: "0 10 * * *", agent: "lead", task: "lead_scoring", description: "Lead scoring-uppdatering" },
  { expression: "0 14 * * 5", agent: "analytics", task: "weekly_report", description: "Analytics veckorapport" },
  // First Monday of month (1st–7th, Monday)
  { expression: "0 9 1-7 * 1", agent: "strategy", task: "monthly_planning", description: "Strategy månadsplanering" },
  // Last Friday of quarter (March, June, September, December)
  {
    expression: "0 9 25-31 3,6,9,12 5",
    agent: "analytics",
    task: "quarterly_review",
    description: "Analytics kvartalsöversikt",
  },
];

export function startScheduler(
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient | null,
  killSwitch: KillSwitch,
  taskQueue: TaskQueue | null = null,
): void {
  for (const entry of SCHEDULE) {
    cron.schedule(entry.expression, async () => {
      if (killSwitch.isActive()) {
        logger.info(`Scheduler: skipping ${entry.description} – kill switch active`, {
          action: "schedule_skipped",
          agent: entry.agent,
        });
        return;
      }

      logger.info(`Scheduler: triggering ${entry.description}`, {
        action: "schedule_trigger",
        agent: entry.agent,
        task: entry.task,
      });

      if (!supabase) return;

      const { data: agentRow } = await supabase.from("agents").select("id, status").eq("slug", entry.agent).single();

      if (agentRow?.status === "paused") {
        logger.info(`Scheduler: ${entry.agent} is paused, skipping`, {
          action: "schedule_skipped",
          agent: entry.agent,
        });
        return;
      }

      await logActivity(supabase, {
        agent_id: agentRow?.id,
        action: "schedule_triggered",
        details_json: { task: entry.task, description: entry.description },
      });

      // Build progress callback for Slack + activity_log
      const slackApp = getSlackApp();
      const channel = AGENT_CHANNEL[entry.agent] ?? CHANNELS.orchestrator;

      const onProgress: ProgressCallback = async (action, message, details) => {
        if (slackApp) {
          try {
            await slackApp.client.chat.postMessage({ channel, text: message });
          } catch (slackErr) {
            logger.warn(`Scheduler: failed to post progress to Slack: ${(slackErr as Error).message}`, {
              action: "slack_progress_error",
              agent: entry.agent,
            });
          }
        }
        await logActivity(supabase, {
          agent_id: agentRow?.id,
          action,
          details_json: { agent: entry.agent, scheduled: true, ...details },
        });
      };

      if (taskQueue) {
        // Enqueue via task queue
        taskQueue.enqueue(
          entry.agent,
          {
            type: entry.task,
            title: entry.description,
            input: `Schemalagd uppgift: ${entry.description}`,
            priority: "normal",
            onProgress,
          },
          "normal",
        );
      } else {
        // Fallback: direct execution
        try {
          const agentInstance = createAgent(entry.agent, config, logger, supabase);

          if (slackApp) {
            try {
              await slackApp.client.chat.postMessage({
                channel,
                text: `:rocket: Startar *${entry.agent}* agent (${entry.task})... _[schemalagd]_`,
              });
            } catch {
              /* non-critical */
            }
          }

          const result = await agentInstance.execute({
            type: entry.task,
            title: entry.description,
            input: `Schemalagd uppgift: ${entry.description}`,
            priority: "normal",
            onProgress,
          });

          if (slackApp) {
            try {
              await slackApp.client.chat.postMessage({
                channel,
                text: `:white_check_mark: *${entry.agent}* klar (${result.status}). Task: \`${result.taskId}\` _[schemalagd]_`,
              });
            } catch {
              /* non-critical */
            }
          }
        } catch (err) {
          const error = err as Error;
          let errorType = "unknown";
          let logLevel: "warn" | "error" = "error";

          if (error.name === "AbortError" || error.message?.includes("timeout")) {
            errorType = "timeout";
            logLevel = "warn";
          } else if (err instanceof LLMError) {
            errorType = "llm";
          } else if (err instanceof AgentError) {
            errorType = "agent";
          } else if (
            error.message?.includes("401") ||
            error.message?.includes("403") ||
            error.message?.includes("auth")
          ) {
            errorType = "auth";
          } else if (
            error.message?.includes("ECONNREFUSED") ||
            error.message?.includes("ENOTFOUND") ||
            error.message?.includes("network")
          ) {
            errorType = "network";
            logLevel = "warn";
          }

          logger[logLevel](`Scheduler: agent execution failed (${errorType}): ${error.message}`, {
            action: "schedule_error",
            agent: entry.agent,
            task: entry.task,
            error: error.message,
            error_type: errorType,
          });

          if (slackApp) {
            try {
              await slackApp.client.chat.postMessage({
                channel,
                text: `:x: *${entry.agent}* misslyckades: ${(err as Error).message} _[schemalagd]_`,
              });
            } catch {
              /* non-critical */
            }
          }
        }
      }
    });
  }

  logger.info(`Scheduler started with ${SCHEDULE.length} cron jobs`, {
    action: "scheduler_start",
    details: { jobs: SCHEDULE.map((s) => s.description) },
  });
}
