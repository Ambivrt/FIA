import { App } from "@slack/bolt";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { TaskQueue } from "../gateway/task-queue";
import { updateTaskStatus, createApproval } from "../supabase/task-writer";
import { logActivity } from "../supabase/activity-writer";
import { createAgent, getAllAgentSlugs } from "../agents/agent-factory";
import { loadAgentManifest } from "../agents/agent-loader";
import { ProgressCallback } from "../agents/base-agent";

export function registerCommands(
  app: App,
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient | null,
  killSwitch: KillSwitch | null,
  taskQueue: TaskQueue | null = null
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

        if (taskQueue) {
          const qs = taskQueue.getStatus();
          statusText += `\n\n*Task Queue:*`;
          statusText += qs.paused ? " :double_vertical_bar: PAUSED" : "";
          statusText += `\n  Queued: ${qs.queued} | Running: ${qs.running}/${qs.maxConcurrency} | Completed: ${qs.completed} | Failed: ${qs.failed}`;
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
          const lines = ["*Usage:* `/fia run <agent> <task-type> [description]`\n", "*Agenter och uppgiftstyper:*"];
          for (const slug of getAllAgentSlugs()) {
            try {
              const m = loadAgentManifest(config.knowledgeDir, slug);
              const taskTypes = Object.keys(m.task_context);
              const routingTypes = Object.keys(m.routing).filter((k) => k !== "default");
              const allTypes = [...new Set([...taskTypes, ...routingTypes])];
              lines.push(`  *${slug}* – ${allTypes.length > 0 ? allTypes.map((t) => `\`${t}\``).join(", ") : "`default`"}`);
            } catch {
              lines.push(`  *${slug}* – \`default\``);
            }
          }
          await respond({ response_type: "ephemeral", text: lines.join("\n") });
          return;
        }
        if (!supabase) {
          await respond({ response_type: "ephemeral", text: ":x: Supabase krävs för att köra agenter." });
          return;
        }
        if (taskQueue) {
          // Enqueue via task queue
          const onProgress: ProgressCallback = async (action, message, details) => {
            await app.client.chat.postMessage({
              channel: command.channel_id,
              text: message,
            });
            await logActivity(supabase, {
              action,
              details_json: { agent: agentSlug, ...details },
            });
          };

          const queueId = taskQueue.enqueue(agentSlug, {
            type: taskType,
            title: taskDesc,
            input: taskDesc,
            priority: "normal",
            onProgress,
          }, "normal");

          await respond({
            response_type: "ephemeral",
            text: `:inbox_tray: *${agentSlug}* (${taskType}) köad. Queue ID: \`${queueId}\``,
          });
        } else {
          // Fallback: direct execution if no queue
          await respond({
            response_type: "ephemeral",
            text: `:rocket: Startar *${agentSlug}* agent (${taskType})...`,
          });
          (async () => {
            try {
              const agent = createAgent(agentSlug, config, logger, supabase);
              const onProgress: ProgressCallback = async (action, message, details) => {
                await app.client.chat.postMessage({
                  channel: command.channel_id,
                  text: message,
                });
                await logActivity(supabase, {
                  action,
                  details_json: { agent: agentSlug, ...details },
                });
              };

              const result = await agent.execute({
                type: taskType,
                title: taskDesc,
                input: taskDesc,
                priority: "normal",
                onProgress,
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
        }
        break;
      }

      default: {
        const helpLines = [
          "*FIA Commands:*",
          "  `/fia status` – Systemstatus, agenter och kill switch",
          "  `/fia kill` – Aktivera kill switch (pausar alla publiceringsagenter)",
          "  `/fia resume` – Avaktivera kill switch",
          "  `/fia approve <task-id>` – Godkänn uppgift",
          "  `/fia reject <task-id> <feedback>` – Avslå uppgift med feedback",
          "  `/fia run <agent> <task-type> [description]` – Trigga agent manuellt",
          "",
          "*Agenter och uppgiftstyper:*",
        ];

        for (const slug of getAllAgentSlugs()) {
          try {
            const m = loadAgentManifest(config.knowledgeDir, slug);
            const taskTypes = Object.keys(m.task_context);
            const routingTypes = Object.keys(m.routing).filter((k) => k !== "default");
            const allTypes = [...new Set([...taskTypes, ...routingTypes])];
            if (allTypes.length > 0) {
              helpLines.push(`  *${slug}* – ${allTypes.map((t) => `\`${t}\``).join(", ")}`);
            } else {
              helpLines.push(`  *${slug}* – \`default\``);
            }
          } catch {
            helpLines.push(`  *${slug}* – \`default\``);
          }
        }

        await respond({
          response_type: "ephemeral",
          text: helpLines.join("\n"),
        });
        break;
      }
    }
  });
}
