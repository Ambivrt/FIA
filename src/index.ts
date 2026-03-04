import { loadConfig } from "./utils/config";
import { createLogger } from "./gateway/logger";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  logger.info("FIA Gateway started", {
    action: "gateway_start",
    status: "success",
  });

  // Keep the process alive for PM2.
  // In Step 2, the Slack Bolt app will replace this heartbeat.
  setInterval(() => {
    // heartbeat
  }, 60_000);

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
