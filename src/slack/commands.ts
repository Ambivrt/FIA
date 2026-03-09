import { App } from "@slack/bolt";
import { Logger } from "../gateway/logger";

export function registerCommands(app: App, logger: Logger): void {
  app.command("/fia", async ({ command, ack, respond }) => {
    await ack();

    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase() || "help";

    logger.info(`Slack command: /fia ${command.text}`, {
      action: "slack_command",
      agent: "gateway",
    });

    switch (subcommand) {
      case "status":
        await respond({
          response_type: "ephemeral",
          text: ":robot_face: *FIA Gateway Status*\nGateway is running. Use the Dashboard for detailed agent status.",
        });
        break;

      case "kill":
        await respond({
          response_type: "in_channel",
          text: ":octagonal_sign: *Kill switch activated.* All publishing agents paused.",
        });
        logger.warn("Kill switch activated via Slack", { action: "kill_switch", status: "success" });
        break;

      case "resume":
        await respond({
          response_type: "in_channel",
          text: ":white_check_mark: *Kill switch deactivated.* Agents resuming normal operations.",
        });
        logger.info("Kill switch deactivated via Slack", { action: "kill_resume", status: "success" });
        break;

      case "approve": {
        const taskId = args[1];
        if (!taskId) {
          await respond({ response_type: "ephemeral", text: "Usage: `/fia approve <task-id>`" });
          return;
        }
        await respond({
          response_type: "ephemeral",
          text: `:white_check_mark: Task \`${taskId}\` approved.`,
        });
        break;
      }

      case "reject": {
        const taskId = args[1];
        const feedback = args.slice(2).join(" ");
        if (!taskId || !feedback) {
          await respond({ response_type: "ephemeral", text: "Usage: `/fia reject <task-id> <feedback>`" });
          return;
        }
        await respond({
          response_type: "ephemeral",
          text: `:x: Task \`${taskId}\` rejected. Feedback: ${feedback}`,
        });
        break;
      }

      case "run": {
        const agentSlug = args[1];
        const taskDesc = args.slice(2).join(" ");
        if (!agentSlug) {
          await respond({ response_type: "ephemeral", text: "Usage: `/fia run <agent> <task description>`" });
          return;
        }
        await respond({
          response_type: "ephemeral",
          text: `:rocket: Triggering *${agentSlug}* agent${taskDesc ? `: ${taskDesc}` : ""}`,
        });
        break;
      }

      default:
        await respond({
          response_type: "ephemeral",
          text: [
            "*FIA Commands:*",
            "`/fia status` – System status",
            "`/fia kill` – Activate kill switch",
            "`/fia resume` – Deactivate kill switch",
            "`/fia approve <task-id>` – Approve task",
            "`/fia reject <task-id> <feedback>` – Reject task",
            "`/fia run <agent> <task>` – Trigger agent manually",
          ].join("\n"),
        });
    }
  });
}
