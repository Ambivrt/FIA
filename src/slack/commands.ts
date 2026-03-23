import { App } from "@slack/bolt";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { TaskQueue, QueueCompleteCallback } from "../gateway/task-queue";
import { updateTaskStatus, createApproval, purgeOrphanedTasks } from "../supabase/task-writer";
import { logActivity } from "../supabase/activity-writer";
import { resolveDisplayStatus, type DisplayStatus } from "../shared/display-status";
import { createAgent, getAllAgentSlugs } from "../agents/agent-factory";
import { loadAgentManifest } from "../agents/agent-loader";
import { ProgressCallback } from "../agents/base-agent";

export function registerCommands(
  app: App,
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient | null,
  killSwitch: KillSwitch | null,
  taskQueue: TaskQueue | null = null,
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
        let statusText = ":robot_face: *FIA Gateway v0.5.1*\nGateway is running.";

        if (killSwitch) {
          const ks = killSwitch.getStatus();
          statusText += ks.active
            ? "\n:octagonal_sign: Kill switch is *ACTIVE*."
            : "\n:white_check_mark: Kill switch is inactive.";
        }

        if (supabase) {
          const { data: agents } = await supabase.from("agents").select("id, name, slug, status").order("name");

          if (agents?.length) {
            const SLACK_EMOJI: Record<DisplayStatus, string> = {
              online: ":large_green_circle:",
              working: ":large_yellow_circle:",
              paused: ":white_circle:",
              killed: ":black_circle:",
              error: ":red_circle:",
            };

            const ksActive = killSwitch?.isActive() ?? false;

            // Fetch running task counts for all agents
            const agentIds = agents.map((a) => a.id);
            const { data: runningTasks } = await supabase
              .from("tasks")
              .select("agent_id")
              .in("agent_id", agentIds)
              .eq("status", "in_progress");

            const runningCounts = new Map<string, number>();
            for (const t of runningTasks ?? []) {
              runningCounts.set(t.agent_id, (runningCounts.get(t.agent_id) ?? 0) + 1);
            }

            statusText += "\n\n*Agents:*";
            for (const a of agents) {
              const ds = resolveDisplayStatus(a, ksActive, (runningCounts.get(a.id) ?? 0) > 0);
              statusText += `\n${SLACK_EMOJI[ds.status]} ${a.name} (${ds.labelSv})`;
            }
          }
        }

        if (taskQueue) {
          const qs = taskQueue.getStatus();
          statusText += `\n\n*Task Queue:*${qs.paused ? " :double_vertical_bar: PAUSAD" : ""}`;
          statusText += `\n:card_index_dividers: Köade: *${qs.queued}* | Körs: *${qs.running}*/${qs.maxConcurrency} | Klara: *${qs.completed}* | Misslyckade: *${qs.failed}*`;
          if (qs.items.length > 0) {
            for (const item of qs.items.slice(0, 5)) {
              const icon = item.status === "running" ? ":arrow_forward:" : ":hourglass_flowing_sand:";
              statusText += `\n  ${icon} ${item.agentSlug} (${item.priority})`;
            }
            if (qs.items.length > 5) {
              statusText += `\n  _...och ${qs.items.length - 5} till. Kör \`/fia queue\` för fullständig lista._`;
            }
          }
        } else {
          statusText += "\n\n*Task Queue:* _Ej aktiv_";
        }

        statusText += `\n\n*Subsystem:*`;
        const jobCount = supabase
          ? ((await supabase.from("scheduled_jobs").select("id", { count: "exact", head: true }).eq("enabled", true)).count ?? 0)
          : 0;
        statusText += `\n:calendar_spiral: Scheduler: *${jobCount}* cron-jobb aktiva`;
        statusText += supabase
          ? "\n:satellite_antenna: Command Listener: *aktiv* (Supabase Realtime)"
          : "\n:satellite_antenna: Command Listener: _ej aktiv_ (Supabase saknas)";
        statusText += `\n:globe_with_meridians: REST API: port *${config.gatewayApiPort}*`;

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
              lines.push(
                `  *${slug}* – ${allTypes.length > 0 ? allTypes.map((t) => `\`${t}\``).join(", ") : "`default`"}`,
              );
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

          const onComplete: QueueCompleteCallback = async (item, result, error) => {
            if (error) {
              await app.client.chat.postMessage({
                channel: command.channel_id,
                text: `:x: *${item.agentSlug}* misslyckades: ${error}`,
              });
            } else if (result) {
              const statusIcon =
                result.status === "completed"
                  ? ":white_check_mark:"
                  : result.status === "escalated"
                    ? ":warning:"
                    : ":x:";
              await app.client.chat.postMessage({
                channel: command.channel_id,
                text: `${statusIcon} *${item.agentSlug}* klar (${result.status}). Task: \`${result.taskId}\``,
              });
            }
          };

          const queueId = taskQueue.enqueue(
            agentSlug,
            {
              type: taskType,
              title: taskDesc,
              input: taskDesc,
              priority: "normal",
              onProgress,
            },
            "normal",
            onComplete,
          );

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
              const agent = await createAgent(agentSlug, config, logger, supabase);
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

      case "queue": {
        if (!taskQueue) {
          await respond({ response_type: "ephemeral", text: ":x: Task queue ej aktiv (Supabase krävs)." });
          break;
        }
        const qs = taskQueue.getStatus();
        const lines = [
          `:card_index_dividers: *Task Queue*${qs.paused ? " :double_vertical_bar: PAUSAD" : ""}`,
          `  Köade: *${qs.queued}* | Körs: *${qs.running}*/${qs.maxConcurrency} | Klara: *${qs.completed}* | Misslyckade: *${qs.failed}*`,
        ];
        if (qs.items.length > 0) {
          lines.push("", "*Aktiva och köade tasks:*");
          for (const item of qs.items) {
            const icon = item.status === "running" ? ":arrow_forward:" : ":hourglass_flowing_sand:";
            lines.push(`  ${icon} \`${item.id}\` – ${item.agentSlug} (${item.priority})`);
          }
        } else {
          lines.push("", "_Inga tasks i kön._");
        }
        await respond({ response_type: "ephemeral", text: lines.join("\n") });
        break;
      }

      case "purge": {
        if (!supabase) {
          await respond({ response_type: "ephemeral", text: ":x: Supabase krävs." });
          break;
        }
        try {
          const recovered = await purgeOrphanedTasks(supabase);
          const total = recovered.queued + recovered.inProgress;

          await logActivity(supabase, {
            action: "tasks_purged",
            details_json: { ...recovered, source: "slack" },
          });

          await respond({
            response_type: "in_channel",
            text:
              total > 0
                ? `:broom: *Purged ${total} stale tasks* (${recovered.queued} queued, ${recovered.inProgress} in_progress) → error.`
                : `:white_check_mark: Inga stale tasks hittades (kollar tasks äldre än 30 min).`,
          });
        } catch (err) {
          await respond({ response_type: "ephemeral", text: `:x: Purge misslyckades: ${(err as Error).message}` });
        }
        break;
      }

      case "help":
      case "?":
      default: {
        const helpLines = [
          "*FIA Commands:*",
          "  `/fia status` – Systemstatus, agenter och kill switch",
          "  `/fia queue` – Visa kö-status (köade och aktiva tasks)",
          "  `/fia kill` – Aktivera kill switch (pausar alla publiceringsagenter)",
          "  `/fia resume` – Avaktivera kill switch",
          "  `/fia approve <task-id>` – Godkänn uppgift",
          "  `/fia reject <task-id> <feedback>` – Avslå uppgift med feedback",
          "  `/fia run <agent> <task-type> [description]` – Trigga agent manuellt",
          "  `/fia purge` – Rensa stale queued/in_progress tasks (>30 min)",
          "  `/fia help` – Visa denna hjälptext",
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

        helpLines.push("", "*Schemalagda jobb:*");
        if (supabase) {
          const { data: dbJobs } = await supabase
            .from("scheduled_jobs")
            .select("cron_expression, title, enabled, agents!inner(slug)")
            .eq("enabled", true)
            .order("created_at");
          for (const j of (dbJobs ?? []) as unknown as { cron_expression: string; title: string; agents: { slug: string } }[]) {
            helpLines.push(`  \`${j.cron_expression}\` – *${j.agents.slug}*: ${j.title}`);
          }
        } else {
          helpLines.push("  _Supabase saknas – inga jobb laddade_");
        }

        helpLines.push(
          "",
          `_REST API: port ${config.gatewayApiPort} | Dashboard: tasks/commands via Supabase Realtime_`,
        );

        await respond({
          response_type: "ephemeral",
          text: helpLines.join("\n"),
        });
        break;
      }
    }
  });
}
