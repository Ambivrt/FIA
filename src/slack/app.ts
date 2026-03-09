import { App, LogLevel } from "@slack/bolt";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { registerCommands } from "./commands";
import { registerHandlers } from "./handlers";

export async function createSlackApp(
  config: AppConfig,
  logger: Logger
): Promise<App> {
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    signingSecret: config.slackSigningSecret,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });

  registerCommands(app, logger);
  registerHandlers(app, logger);

  await app.start();
  logger.info("Slack app started (Socket Mode)", { action: "slack_start", status: "success" });

  return app;
}
