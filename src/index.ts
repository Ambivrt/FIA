import { loadConfig } from "./utils/config";
import { createLogger } from "./gateway/logger";
import { createSupabaseClient } from "./supabase/client";
import { startHeartbeat } from "./supabase/heartbeat";
import { createSlackApp } from "./slack/app";

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

  // --- Slack ---
  if (config.slackBotToken && config.slackAppToken) {
    try {
      await createSlackApp(config, logger);
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
