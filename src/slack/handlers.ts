import { App } from "@slack/bolt";
import { Logger } from "../gateway/logger";
import { CHANNELS } from "./channels";

export function registerHandlers(app: App, logger: Logger): void {
  // Listen for messages in #fia-orchestrator for escalation handling
  app.message(async ({ message, say }) => {
    // Only process user messages (not bot messages)
    if (!("user" in message) || ("bot_id" in message)) return;

    logger.debug("Slack message received", {
      action: "slack_message",
      agent: "gateway",
    });
  });
}

export async function sendEscalation(
  app: App,
  logger: Logger,
  agentSlug: string,
  taskId: string,
  reason: string
): Promise<void> {
  try {
    await app.client.chat.postMessage({
      channel: CHANNELS.orchestrator,
      text: `:warning: *Escalation from ${agentSlug} agent*\nTask: \`${taskId}\`\nReason: ${reason}`,
    });
    logger.info("Escalation sent to Slack", {
      action: "escalation",
      agent: agentSlug,
      task_id: taskId,
    });
  } catch (err) {
    logger.error("Failed to send escalation to Slack", {
      action: "escalation",
      agent: agentSlug,
      error: (err as Error).message,
    });
  }
}
