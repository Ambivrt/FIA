import { ZodError } from "zod";
import { loadConfig } from "./utils/config";
import { createLogger } from "./gateway/logger";
import { createSupabaseClient } from "./supabase/client";
import { startHeartbeat } from "./supabase/heartbeat";
import { startCommandListener } from "./supabase/command-listener";
import { startTaskListener } from "./supabase/task-listener";
import { createSlackApp } from "./slack/app";
import { createApiServer, startApiServer } from "./api/server";
import { createScheduler } from "./gateway/scheduler";
import { KillSwitch } from "./utils/kill-switch";
import { TaskQueue } from "./gateway/task-queue";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ZodError) {
      console.error("Configuration validation failed:");
      for (const issue of err.issues) {
        console.error(`  ${issue.path.join(".")}: ${issue.message}`);
      }
    } else {
      console.error("Failed to load configuration:", (err as Error).message);
    }
    process.exit(1);
  }

  const logger = createLogger(config);

  logger.info("FIA Gateway v0.5.2 starting", {
    action: "gateway_start",
    status: "success",
  });

  // --- Supabase ---
  let supabase = null;
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    supabase = createSupabaseClient(config);
    startHeartbeat(supabase, logger);
    logger.info("Supabase connected, heartbeat started", { action: "supabase_init" });

    // Sync agent manifests → Supabase config_json (dashboard reads this)
    const { syncAgentManifests } = await import("./supabase/manifest-sync");
    await syncAgentManifests(supabase, config, logger);
  } else {
    logger.warn("Supabase not configured – skipping", { action: "supabase_init" });
  }

  // --- Kill Switch ---
  const killSwitch = new KillSwitch(supabase, logger);

  // --- Task Queue ---
  let taskQueue: TaskQueue | null = null;
  if (supabase) {
    taskQueue = new TaskQueue(config, logger, supabase, config.queueMaxConcurrency);
    killSwitch.setTaskQueue(taskQueue);
    logger.info(`Task queue initialized (max concurrency: ${config.queueMaxConcurrency})`, {
      action: "queue_init",
    });
  }

  // --- Restore kill switch state from database ---
  if (supabase) {
    await killSwitch.restoreFromDatabase();
  }

  // --- Recover orphaned tasks ---
  if (supabase) {
    const { recoverOrphanedTasks } = await import("./supabase/task-writer");
    const { logActivity } = await import("./supabase/activity-writer");
    const recovered = await recoverOrphanedTasks(supabase);
    if (recovered.queued > 0 || recovered.inProgress > 0) {
      logger.warn(`Recovered orphaned tasks: ${recovered.queued} queued, ${recovered.inProgress} in_progress → error`, {
        action: "task_recovery",
        details: recovered,
      });
      await logActivity(supabase, {
        action: "tasks_recovered_on_startup",
        details_json: recovered,
      });
    }
  }

  // --- Slack ---
  if (config.slackBotToken && config.slackAppToken) {
    try {
      await createSlackApp(config, logger, supabase, killSwitch, taskQueue);
      logger.info("Slack app connected", { action: "slack_init" });
    } catch (err) {
      logger.error("Slack app failed to start", {
        action: "slack_init",
        error: (err as Error).message,
      });
    }
  } else {
    logger.warn("Slack not configured – skipping", { action: "slack_init" });
  }

  // --- REST API ---
  if (supabase) {
    const app = createApiServer(config, logger, supabase, killSwitch);
    startApiServer(app, config.gatewayApiPort, logger);
  } else {
    logger.warn("REST API not started – Supabase required", { action: "api_init" });
  }

  // --- Scheduler (database-driven) ---
  const scheduler = createScheduler(config, logger, supabase, killSwitch, taskQueue);
  if (supabase) {
    await scheduler.loadAll();
  }

  // --- Realtime Listeners (Supabase) ---
  if (supabase) {
    startCommandListener(supabase, logger, killSwitch, scheduler, config);
    startTaskListener(supabase, config, logger, killSwitch, taskQueue);
  }

  logger.info("FIA Gateway ready", {
    action: "gateway_ready",
    status: "success",
  });

  // Keep process alive for PM2
  setInterval(() => {}, 60_000);

  const shutdown = (): void => {
    scheduler.stopAll();
    logger.info("FIA Gateway shutting down", {
      action: "gateway_stop",
      status: "success",
    });
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err: Error) => {
  console.error("Fatal error during startup:", err.message);
  process.exit(1);
});
