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

interface ScheduledJobRow {
  id: string;
  agent_slug: string;
  agent_id: string;
  cron_expression: string;
  task_type: string;
  title: string;
  priority: string;
  description: string | null;
  enabled: boolean;
}

/** Map agent slug to the Slack channel for progress messages */
const AGENT_CHANNEL: Record<string, string> = {
  content: CHANNELS.content,
  campaign: CHANNELS.campaigns,
  analytics: CHANNELS.analytics,
  intelligence: CHANNELS.intelligence,
  strategy: CHANNELS.orchestrator,
  lead: CHANNELS.orchestrator,
  seo: CHANNELS.orchestrator,
  brand: CHANNELS.orchestrator,
};

/**
 * Database-driven scheduler that reads from `scheduled_jobs` table.
 * Replaces the old hardcoded SCHEDULE array.
 */
export class DynamicScheduler {
  private jobs = new Map<string, cron.ScheduledTask>();

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly supabase: SupabaseClient | null,
    private readonly killSwitch: KillSwitch,
    private readonly taskQueue: TaskQueue | null = null,
  ) {}

  /** Load all enabled jobs from database and register cron tasks. */
  async loadAll(): Promise<void> {
    if (!this.supabase) {
      this.logger.warn("Scheduler: no Supabase client – skipping database load", { action: "scheduler_load" });
      return;
    }

    const { data, error } = await this.supabase
      .from("scheduled_jobs")
      .select("id, agent_id, cron_expression, task_type, title, priority, description, enabled, agents!inner(slug)")
      .eq("enabled", true);

    if (error) {
      this.logger.error("Scheduler: failed to load scheduled jobs from database", {
        action: "scheduler_load",
        error: error.message,
      });
      return;
    }

    const rows = (data ?? []) as unknown as (Omit<ScheduledJobRow, "agent_slug"> & { agents: { slug: string } })[];

    for (const row of rows) {
      const job: ScheduledJobRow = {
        ...row,
        agent_slug: row.agents.slug,
      };
      this.scheduleJob(job);
    }

    this.logger.info(`Scheduler loaded ${this.jobs.size} jobs from database`, {
      action: "scheduler_load",
      details: { count: this.jobs.size, jobs: rows.map((r) => r.title) },
    });
  }

  /** Stop all current cron tasks and reload from database. */
  async reload(): Promise<void> {
    this.stopAll();
    await this.loadAll();
    this.logger.info("Scheduler reloaded", { action: "scheduler_reload" });
  }

  /** Stop all cron tasks. */
  stopAll(): void {
    for (const task of this.jobs.values()) {
      task.stop();
    }
    this.jobs.clear();
  }

  private scheduleJob(job: ScheduledJobRow): void {
    if (!cron.validate(job.cron_expression)) {
      this.logger.warn(`Scheduler: invalid cron expression for job "${job.title}": ${job.cron_expression}`, {
        action: "scheduler_invalid_cron",
        details: { job_id: job.id, expression: job.cron_expression },
      });
      return;
    }

    const task = cron.schedule(job.cron_expression, () => {
      this.executeJob(job).catch((err) => {
        this.logger.error(`Scheduler: unhandled error in job "${job.title}": ${(err as Error).message}`, {
          action: "schedule_error",
          details: { job_id: job.id },
        });
      });
    });

    this.jobs.set(job.id, task);
  }

  private async executeJob(job: ScheduledJobRow): Promise<void> {
    if (this.killSwitch.isActive()) {
      this.logger.info(`Scheduler: skipping ${job.title} – kill switch active`, {
        action: "schedule_skipped",
        agent: job.agent_slug,
      });
      return;
    }

    this.logger.info(`Scheduler: triggering ${job.title}`, {
      action: "schedule_trigger",
      agent: job.agent_slug,
      task: job.task_type,
    });

    if (!this.supabase) return;

    const { data: agentRow } = await this.supabase
      .from("agents")
      .select("id, status")
      .eq("slug", job.agent_slug)
      .single();

    if (agentRow?.status === "paused") {
      this.logger.info(`Scheduler: ${job.agent_slug} is paused, skipping`, {
        action: "schedule_skipped",
        agent: job.agent_slug,
      });
      return;
    }

    await logActivity(this.supabase, {
      agent_id: agentRow?.id,
      action: "schedule_triggered",
      details_json: { task: job.task_type, description: job.title, job_id: job.id },
    });

    // Update last_triggered_at
    await this.supabase.from("scheduled_jobs").update({ last_triggered_at: new Date().toISOString() }).eq("id", job.id);

    // Build progress callback for Slack + activity_log
    const slackApp = getSlackApp();
    const channel = AGENT_CHANNEL[job.agent_slug] ?? CHANNELS.orchestrator;

    const onProgress: ProgressCallback = async (action, message, details) => {
      if (slackApp) {
        try {
          await slackApp.client.chat.postMessage({ channel, text: message });
        } catch (slackErr) {
          this.logger.warn(`Scheduler: failed to post progress to Slack: ${(slackErr as Error).message}`, {
            action: "slack_progress_error",
            agent: job.agent_slug,
          });
        }
      }
      await logActivity(this.supabase!, {
        agent_id: agentRow?.id,
        action,
        details_json: { agent: job.agent_slug, scheduled: true, ...details },
      });
    };

    if (this.taskQueue) {
      // Enqueue via task queue
      this.taskQueue.enqueue(
        job.agent_slug,
        {
          type: job.task_type,
          title: job.title,
          input: `Schemalagd uppgift: ${job.title}`,
          priority: job.priority,
          onProgress,
        },
        job.priority,
      );
    } else {
      // Fallback: direct execution
      try {
        const agentInstance = await createAgent(job.agent_slug, this.config, this.logger, this.supabase);

        if (slackApp) {
          try {
            await slackApp.client.chat.postMessage({
              channel,
              text: `:rocket: Startar *${job.agent_slug}* agent (${job.task_type})... _[schemalagd]_`,
            });
          } catch {
            /* non-critical */
          }
        }

        const result = await agentInstance.execute({
          type: job.task_type,
          title: job.title,
          input: `Schemalagd uppgift: ${job.title}`,
          priority: job.priority,
          onProgress,
        });

        if (slackApp) {
          try {
            await slackApp.client.chat.postMessage({
              channel,
              text: `:white_check_mark: *${job.agent_slug}* klar (${result.status}). Task: \`${result.taskId}\` _[schemalagd]_`,
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

        this.logger[logLevel](`Scheduler: agent execution failed (${errorType}): ${error.message}`, {
          action: "schedule_error",
          agent: job.agent_slug,
          task: job.task_type,
          error: error.message,
          error_type: errorType,
        });

        if (slackApp) {
          try {
            await slackApp.client.chat.postMessage({
              channel,
              text: `:x: *${job.agent_slug}* misslyckades: ${(err as Error).message} _[schemalagd]_`,
            });
          } catch {
            /* non-critical */
          }
        }
      }
    }
  }
}

/** Create and return a DynamicScheduler instance. Call loadAll() after creation. */
export function createScheduler(
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient | null,
  killSwitch: KillSwitch,
  taskQueue: TaskQueue | null = null,
): DynamicScheduler {
  return new DynamicScheduler(config, logger, supabase, killSwitch, taskQueue);
}
