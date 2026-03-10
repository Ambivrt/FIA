import { loadConfig } from "./utils/config";
import { createLogger } from "./gateway/logger";
import { createSupabaseClient } from "./supabase/client";
import { startHeartbeat } from "./supabase/heartbeat";
import { startCommandListener } from "./supabase/command-listener";
import { createSlackApp } from "./slack/app";
import { createApiServer, startApiServer } from "./api/server";
import { startScheduler } from "./gateway/scheduler";
import { KillSwitch } from "./utils/kill-switch";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  logger.info("FIA Gateway starting", {
    action: "gateway_start",
    status: "success",
  });

  // --- Supabase ---
  let supabase = null;
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    supabase = createSupabaseClient(config);
    startHeartbeat(supabase, logger);
    logger.info("Supabase connected, heartbeat started", { action: "supabase_init" });
  } else {
    logger.warn("Supabase not configured – skipping", { action: "supabase_init" });
  }

  // --- Kill Switch ---
  const killSwitch = new KillSwitch(supabase, logger);

  // --- Slack ---
  if (config.slackBotToken && config.slackAppToken) {
    try {
      await createSlackApp(config, logger, supabase, killSwitch);
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

  // --- Command Listener (Supabase Realtime) ---
  if (supabase) {
    startCommandListener(supabase, logger, killSwitch);
  }

  // --- Scheduler ---
  startScheduler(config, logger, supabase, killSwitch);

  logger.info("FIA Gateway ready", {
    action: "gateway_ready",
    status: "success",
  });

  // Keep process alive for PM2
  setInterval(() => {}, 60_000);

  const shutdown = (): void => {
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
