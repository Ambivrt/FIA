import { App, LogLevel, SocketModeReceiver } from "@slack/bolt";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { TaskQueue } from "../gateway/task-queue";
import { registerCommands } from "./commands";
import { registerHandlers } from "./handlers";

let slackAppInstance: App | null = null;

export function getSlackApp(): App | null {
  return slackAppInstance;
}

export async function createSlackApp(
  config: AppConfig,
  logger: Logger,
  supabase?: SupabaseClient | null,
  killSwitch?: KillSwitch,
  taskQueue?: TaskQueue | null,
): Promise<App> {
  const receiver = new SocketModeReceiver({
    appToken: config.slackAppToken,
    logLevel: LogLevel.WARN,
  });

  // Increase ping/pong timeouts for GCP network latency (default: 5000ms)
  const smClient = receiver.client as unknown as {
    clientPingTimeoutMS: number;
    serverPingTimeoutMS: number;
  };
  smClient.clientPingTimeoutMS = 15_000;
  smClient.serverPingTimeoutMS = 45_000;

  const app = new App({
    token: config.slackBotToken,
    signingSecret: config.slackSigningSecret,
    receiver,
    logLevel: LogLevel.WARN,
  });

  registerCommands(app, config, logger, supabase ?? null, killSwitch ?? null, taskQueue ?? null);
  registerHandlers(app, logger);

  await app.start();
  slackAppInstance = app;
  logger.info("Slack app started (Socket Mode)", { action: "slack_start", status: "success" });

  return app;
}
