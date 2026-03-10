import { App, LogLevel } from "@slack/bolt";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { registerCommands } from "./commands";
import { registerHandlers } from "./handlers";

export async function createSlackApp(
  config: AppConfig,
  logger: Logger,
  supabase?: SupabaseClient | null,
  killSwitch?: KillSwitch
): Promise<App> {
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    signingSecret: config.slackSigningSecret,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });

  registerCommands(app, logger, supabase ?? null, killSwitch ?? null);
  registerHandlers(app, logger);

  await app.start();
  logger.info("Slack app started (Socket Mode)", { action: "slack_start", status: "success" });

  return app;
}
