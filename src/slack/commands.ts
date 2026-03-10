import { App } from "@slack/bolt";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { updateTaskStatus, createApproval } from "../supabase/task-writer";
import { logActivity } from "../supabase/activity-writer";
import { createAgent, getAllAgentSlugs } from "../agents/agent-factory";

export function registerCommands(
  app: App,
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient | null,
  killSwitch: KillSwitch | null
): void {
  app.command("/fia", async ({ command, ack, respond }) => {
    await ack();

    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase() || "help";

    logger.info(`Slack command: /fia ${command.text}`, {
      action: "slack_command",
      agent: "gateway",
    });

    switch (subcommand) {
      case "status": {
        let statusText = ":robot_face: *FIA Gateway Status*\nGateway is running.";

        if (killSwitch) {
          const ks = killSwitch.getStatus();
          statusText += ks.active
            ? "\n:octagonal_sign: Kill switch is *ACTIVE*."
            : "\n:white_check_mark: Kill switch is inactive.";
        }

        if (supabase) {
          const { data: agents } = await supabase
            .from("agents")
            .select("name, slug, status")
            .order("name");

          if (agents?.length) {
            statusText += "\n\n*Agents:*";
            for (const a of agents) {
              const icon = a.status === "active" ? ":large_green_circle:" : a.status === "paused" ? ":double_vertical_bar:" : ":red_circle:";
              statusText += `\n${icon} ${a.name} (${a.status})`;
            }
          }
        }

        await respond({ response_type: "ephemeral", text: statusText });
        break;
      }

      case "kill":
        if (killSwitch) {
          await killSwitch.activate("slack");
        }
        await respond({
          response_type: "in_channel",
          text: ":octagonal_sign: *Kill switch activated.* All publishing agents paused.",
        });
        break;

      case "resume":
        if (killSwitch) {
          await killSwitch.deactivate("slack");
        }
        await respond({
          response_type: "in_channel",
          text: ":white_check_mark: *Kill switch deactivated.* Agents resuming normal operations.",
        });
        break;

      case "approve": {
        const taskId = args[1];
        if (!taskId) {
          await respond({ response_type: "ephemeral", text: "Usage: `/fia approve <task-id>`" });
          return;
        }
        if (supabase) {
          try {
            await updateTaskStatus(supabase, taskId, "approved");
            await createApproval(supabase, {
              task_id: taskId,
              reviewer_type: "orchestrator",
              decision: "approved",
              feedback: args.slice(2).join(" ") || undefined,
            });
            await logActivity(supabase, {
              action: "task_approved",
              details_json: { task_id: taskId, source: "slack" },
            });
          } catch (err) {
            await respond({ response_type: "ephemeral", text: `:x: Failed to approve: ${(err as Error).message}` });
            return;
          }
        }
        await respond({ response_type: "ephemeral", text: `:white_check_mark: Task \`${taskId}\` approved.` });
        break;
      }

      case "reject": {
        const taskId = args[1];
        const feedback = args.slice(2).join(" ");
        if (!taskId || !feedback) {
          await respond({ response_type: "ephemeral", text: "Usage: `/fia reject <task-id> <feedback>`" });
          return;
        }
        if (supabase) {
          try {
            await updateTaskStatus(supabase, taskId, "rejected");
            await createApproval(supabase, {
              task_id: taskId,
              reviewer_type: "orchestrator",
              decision: "rejected",
              feedback,
            });
            await logActivity(supabase, {
              action: "task_rejected",
              details_json: { task_id: taskId, feedback, source: "slack" },
            });
          } catch (err) {
            await respond({ response_type: "ephemeral", text: `:x: Failed to reject: ${(err as Error).message}` });
            return;
          }
        }
        await respond({ response_type: "ephemeral", text: `:x: Task \`${taskId}\` rejected. Feedback: ${feedback}` });
        break;
      }

      case "run": {
        const agentSlug = args[1];
        const taskType = args[2] || "default";
        const taskDesc = args.slice(3).join(" ") || `Manuellt triggad: ${taskType}`;
        if (!agentSlug) {
          const validSlugs = getAllAgentSlugs().join(", ");
          await respond({ response_type: "ephemeral", text: `Usage: \`/fia run <agent> [task-type] [description]\`\nAgenter: ${validSlugs}` });
          return;
        }
        if (!supabase) {
          await respond({ response_type: "ephemeral", text: ":x: Supabase krävs för att köra agenter." });
          return;
        }
        await respond({
          response_type: "ephemeral",
          text: `:rocket: Startar *${agentSlug}* agent (${taskType})...`,
        });
        // Execute async – don't block the Slack response
        (async () => {
          try {
            const agent = createAgent(agentSlug, config, logger, supabase);
            const result = await agent.execute({
              type: taskType,
              title: taskDesc,
              input: taskDesc,
              priority: "normal",
            });
            await app.client.chat.postMessage({
              channel: command.channel_id,
              text: `:white_check_mark: *${agentSlug}* klar (${result.status}). Task: \`${result.taskId}\``,
            });
          } catch (err) {
            await app.client.chat.postMessage({
              channel: command.channel_id,
              text: `:x: *${agentSlug}* misslyckades: ${(err as Error).message}`,
            });
          }
        })();
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
