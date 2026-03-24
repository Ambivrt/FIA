import { App } from "@slack/bolt";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { TaskQueue, QueueCompleteCallback } from "../gateway/task-queue";
import { updateTaskStatus, createApproval, purgeOrphanedTasks } from "../supabase/task-writer";
import { logActivity } from "../supabase/activity-writer";
import { resolveDisplayStatus, type DisplayStatus } from "../shared/display-status";
import {
  listScheduledJobs,
  getScheduledJob,
  createScheduledJob,
  updateScheduledJob,
  deleteScheduledJob,
  enableScheduledJob,
  disableScheduledJob,
  resolveAgentBySlug,
  CronServiceError,
} from "../shared/cron-service";
import { createAgent, getAllAgentSlugs } from "../agents/agent-factory";
import { loadAgentManifest } from "../agents/agent-loader";
import { ProgressCallback } from "../agents/base-agent";
import { formatSlackStatus } from "./status-formatter";

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
        let statusText = ":robot_face: *FIA Gateway v0.5.5*\nGateway is running.";

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
          ? ((await supabase.from("scheduled_jobs").select("id", { count: "exact", head: true }).eq("enabled", true))
              .count ?? 0)
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
              const { icon, text } = formatSlackStatus(result.status);
              await app.client.chat.postMessage({
                channel: command.channel_id,
                text: `${icon} *${item.agentSlug}* ${text}. Task: \`${result.taskId}\``,
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
              const { icon, text } = formatSlackStatus(result.status);
              await app.client.chat.postMessage({
                channel: command.channel_id,
                text: `${icon} *${agentSlug}* ${text}. Task: \`${result.taskId}\``,
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

      case "triggers": {
        const subCmd = args[1]?.toLowerCase();

        // /fia triggers approve <id>
        if (subCmd === "approve") {
          const triggerId = args[2];
          if (!triggerId) {
            await respond({ response_type: "ephemeral", text: "Usage: `/fia triggers approve <trigger-id>`" });
            return;
          }
          if (!supabase) {
            await respond({ response_type: "ephemeral", text: ":x: Supabase krävs." });
            return;
          }
          try {
            const { data: trigger, error: fetchErr } = await supabase
              .from("pending_triggers")
              .select("*, agents!target_agent_slug(id)")
              .eq("id", triggerId)
              .eq("status", "pending")
              .single();

            if (fetchErr || !trigger) {
              await respond({ response_type: "ephemeral", text: `:x: Pending trigger \`${triggerId}\` not found.` });
              return;
            }

            // Resolve target agent ID
            const { data: targetAgent } = await supabase
              .from("agents")
              .select("id")
              .eq("slug", trigger.target_agent_slug)
              .single();

            if (!targetAgent) {
              await respond({
                response_type: "ephemeral",
                text: `:x: Target agent '${trigger.target_agent_slug}' not found.`,
              });
              return;
            }

            // Import createTask inline to avoid circular deps
            const { createTask } = await import("../supabase/task-writer");
            const newTaskId = await createTask(supabase, {
              agent_id: targetAgent.id,
              type: trigger.target_task_type,
              title: `${trigger.target_task_type} (trigger: ${trigger.trigger_name})`,
              priority: trigger.priority,
              status: "queued",
              content_json: trigger.context_json ?? {},
              source: "trigger",
              parent_task_id: trigger.source_task_id,
              trigger_source: trigger.trigger_name,
            });

            await supabase
              .from("pending_triggers")
              .update({ status: "executed", decided_at: new Date().toISOString() })
              .eq("id", triggerId);

            await supabase.from("tasks").update({ status: "triggered" }).eq("id", trigger.source_task_id);

            await logActivity(supabase, {
              action: "trigger_approved",
              details_json: {
                trigger_id: triggerId,
                trigger_name: trigger.trigger_name,
                source: "slack",
                new_task_id: newTaskId,
              },
            });

            await respond({
              response_type: "in_channel",
              text: `:white_check_mark: Trigger \`${trigger.trigger_name}\` approved — task \`${newTaskId.slice(0, 8)}\` queued for *${trigger.target_agent_slug}*.`,
            });
          } catch (err) {
            await respond({
              response_type: "ephemeral",
              text: `:x: Failed to approve trigger: ${(err as Error).message}`,
            });
          }
          return;
        }

        // /fia triggers reject <id> <reason...>
        if (subCmd === "reject") {
          const triggerId = args[2];
          const reason = args.slice(3).join(" ");
          if (!triggerId || !reason) {
            await respond({
              response_type: "ephemeral",
              text: "Usage: `/fia triggers reject <trigger-id> <reason>`",
            });
            return;
          }
          if (!supabase) {
            await respond({ response_type: "ephemeral", text: ":x: Supabase krävs." });
            return;
          }
          try {
            const { data: trigger, error: fetchErr } = await supabase
              .from("pending_triggers")
              .select("trigger_name")
              .eq("id", triggerId)
              .eq("status", "pending")
              .single();

            if (fetchErr || !trigger) {
              await respond({ response_type: "ephemeral", text: `:x: Pending trigger \`${triggerId}\` not found.` });
              return;
            }

            await supabase
              .from("pending_triggers")
              .update({ status: "rejected", decided_at: new Date().toISOString() })
              .eq("id", triggerId);

            await logActivity(supabase, {
              action: "trigger_rejected",
              details_json: { trigger_id: triggerId, trigger_name: trigger.trigger_name, reason, source: "slack" },
            });

            await respond({
              response_type: "in_channel",
              text: `:x: Trigger \`${trigger.trigger_name}\` rejected. Reason: ${reason}`,
            });
          } catch (err) {
            await respond({
              response_type: "ephemeral",
              text: `:x: Failed to reject trigger: ${(err as Error).message}`,
            });
          }
          return;
        }

        // /fia triggers – list pending
        if (!supabase) {
          await respond({ response_type: "ephemeral", text: ":x: Supabase krävs." });
          return;
        }
        try {
          const agentFilter = args[1] === "--agent" ? args[2] : undefined;
          let query = supabase
            .from("pending_triggers")
            .select("*, tasks!source_task_id(id, title, type, agents(slug, name))")
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(10);

          if (agentFilter) {
            query = query.eq("target_agent_slug", agentFilter);
          }

          const { data: pending, error } = await query;
          if (error) throw error;

          if (!pending || pending.length === 0) {
            await respond({ response_type: "ephemeral", text: ":white_check_mark: No pending triggers." });
            return;
          }

          const PRIORITY_ICON: Record<string, string> = {
            critical: ":red_circle:",
            high: ":large_yellow_circle:",
            normal: ":white_circle:",
            low: ":white_circle:",
          };

          const lines = [`:hourglass_flowing_sand: *Pending Triggers (${pending.length})*`];
          for (const t of pending as unknown as Array<{
            id: string;
            trigger_name: string;
            target_agent_slug: string;
            target_task_type: string;
            priority: string;
            created_at: string;
            tasks?: { agents?: { slug: string } | null; type?: string } | null;
          }>) {
            const sourceAgent = t.tasks?.agents?.slug ?? "?";
            const icon = PRIORITY_ICON[t.priority] ?? ":white_circle:";
            const age = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
            lines.push(
              `${icon} \`${t.id.slice(0, 8)}\` *${t.trigger_name}* — ${sourceAgent} → ${t.target_agent_slug}/${t.target_task_type} (${t.priority}, ${age}m ago)`,
            );
          }
          lines.push("", "_Approve: `/fia triggers approve <id>` | Reject: `/fia triggers reject <id> <reason>`_");

          await respond({ response_type: "ephemeral", text: lines.join("\n") });
        } catch (err) {
          await respond({
            response_type: "ephemeral",
            text: `:x: Failed to fetch triggers: ${(err as Error).message}`,
          });
        }
        break;
      }

      case "lineage": {
        const taskId = args[1];
        if (!taskId) {
          await respond({ response_type: "ephemeral", text: "Usage: `/fia lineage <task-id>`" });
          return;
        }
        if (!supabase) {
          await respond({ response_type: "ephemeral", text: ":x: Supabase krävs." });
          return;
        }
        try {
          // Fetch current task
          const { data: task } = await supabase
            .from("tasks")
            .select("id, title, type, status, parent_task_id, trigger_source, agents(slug, name)")
            .eq("id", taskId)
            .single();

          if (!task) {
            await respond({ response_type: "ephemeral", text: `:x: Task \`${taskId}\` not found.` });
            return;
          }

          // Walk ancestors
          const ancestors: (typeof task)[] = [];
          let currentId: string | null = (task as unknown as { parent_task_id: string | null }).parent_task_id;
          let depth = 0;
          while (currentId && depth < 5) {
            const { data: parent } = await supabase
              .from("tasks")
              .select("id, title, type, status, parent_task_id, trigger_source, agents(slug, name)")
              .eq("id", currentId)
              .single();
            if (!parent) break;
            ancestors.unshift(parent);
            currentId = (parent as unknown as { parent_task_id: string | null }).parent_task_id;
            depth++;
          }

          // Fetch children
          const { data: children } = await supabase
            .from("tasks")
            .select("id, title, type, status, trigger_source, agents(slug, name)")
            .eq("parent_task_id", taskId)
            .order("created_at", { ascending: false });

          const statusIcon = (s: string): string => {
            const map: Record<string, string> = {
              completed: ":white_check_mark:",
              in_progress: ":arrow_forward:",
              queued: ":hourglass_flowing_sand:",
              triggered: ":zap:",
              rejected: ":x:",
              error: ":red_circle:",
              escalated: ":warning:",
            };
            return map[s] ?? ":white_circle:";
          };

          const lines = [`:thread: *Task Lineage for \`${taskId.slice(0, 8)}\`*`];

          if (ancestors.length > 0) {
            lines.push("", "*Ancestors:*");
            for (const a of ancestors as unknown as Array<{
              id: string;
              type: string;
              status: string;
              trigger_source?: string | null;
              agents?: { slug: string } | null;
            }>) {
              lines.push(
                `  ${statusIcon(a.status)} \`${a.id.slice(0, 8)}\` *${a.agents?.slug ?? "?"}*/${a.type} (${a.status})${a.trigger_source ? ` ← ${a.trigger_source}` : ""}`,
              );
            }
          }

          const t = task as unknown as {
            id: string;
            type: string;
            status: string;
            trigger_source?: string | null;
            agents?: { slug: string } | null;
          };
          lines.push(
            "",
            `*Current:* ${statusIcon(t.status)} \`${t.id.slice(0, 8)}\` *${t.agents?.slug ?? "?"}*/${t.type} (${t.status})`,
          );

          if (children && children.length > 0) {
            lines.push("", "*Children:*");
            for (const c of children as unknown as Array<{
              id: string;
              type: string;
              status: string;
              trigger_source?: string | null;
              agents?: { slug: string } | null;
            }>) {
              lines.push(
                `  ${statusIcon(c.status)} \`${c.id.slice(0, 8)}\` *${c.agents?.slug ?? "?"}*/${c.type} (${c.status})${c.trigger_source ? ` ← ${c.trigger_source}` : ""}`,
              );
            }
          } else {
            lines.push("", "_No children._");
          }

          await respond({ response_type: "ephemeral", text: lines.join("\n") });
        } catch (err) {
          await respond({
            response_type: "ephemeral",
            text: `:x: Failed to fetch lineage: ${(err as Error).message}`,
          });
        }
        break;
      }

      case "cron":
      case "schedule":
      case "jobs": {
        if (!supabase) {
          await respond({ response_type: "ephemeral", text: ":x: Supabase krävs." });
          break;
        }

        const cronSubCmd = args[1]?.toLowerCase();

        try {
          // /fia cron create <agent> <task-type> <m> <h> <dom> <mon> <dow> <title...>
          if (cronSubCmd === "create") {
            const agentSlug = args[2];
            const taskType = args[3];
            const cronFields = args.slice(4, 9);
            const titleParts = args.slice(9);

            if (!agentSlug || !taskType || cronFields.length < 5 || titleParts.length === 0) {
              await respond({
                response_type: "ephemeral",
                text:
                  "Usage: `/fia cron create <agent> <task-type> <min> <hour> <dom> <mon> <dow> <title...>`\n" +
                  "Example: `/fia cron create analytics morning_pulse 0 7 * * 1-5 Morgonpuls varje vardag`",
              });
              break;
            }

            const cronExpr = cronFields.join(" ");
            const title = titleParts.join(" ");

            const agent = await resolveAgentBySlug(supabase, agentSlug);
            const job = await createScheduledJob(
              supabase,
              {
                agent_id: agent.id,
                cron_expression: cronExpr,
                task_type: taskType,
                title,
              },
              "slack",
            );

            await logActivity(supabase, {
              action: "scheduled_job_created",
              details_json: { job_id: job.id, agent: agentSlug, cron: cronExpr, source: "slack" },
            });

            await respond({
              response_type: "in_channel",
              text: `:white_check_mark: *Cron-jobb skapat:* \`${job.id.slice(0, 8)}\` – *${agentSlug}*/${taskType} \`${cronExpr}\` "${title}"`,
            });
            break;
          }

          // /fia cron edit <id> <field>=<value> ...
          if (cronSubCmd === "edit") {
            const jobId = args[2];
            const kvPairs = args.slice(3);
            if (!jobId || kvPairs.length === 0) {
              await respond({
                response_type: "ephemeral",
                text: "Usage: `/fia cron edit <id> <field>=<value> ...`\nFields: cron, task_type, title, priority, description, agent",
              });
              break;
            }

            const updates: Record<string, unknown> = {};
            for (const kv of kvPairs) {
              const eqIdx = kv.indexOf("=");
              if (eqIdx === -1) continue;
              const key = kv.slice(0, eqIdx).toLowerCase();
              const val = kv.slice(eqIdx + 1);
              if (key === "cron") updates.cron_expression = val.replace(/_/g, " ");
              else if (key === "task_type") updates.task_type = val;
              else if (key === "title") updates.title = val.replace(/_/g, " ");
              else if (key === "priority") updates.priority = val;
              else if (key === "description") updates.description = val.replace(/_/g, " ");
              else if (key === "agent") {
                const a = await resolveAgentBySlug(supabase, val);
                updates.agent_id = a.id;
              }
            }

            if (Object.keys(updates).length === 0) {
              await respond({ response_type: "ephemeral", text: ":x: Inga giltiga fält att uppdatera." });
              break;
            }

            const job = await updateScheduledJob(supabase, jobId, updates, "slack");

            await respond({
              response_type: "in_channel",
              text: `:pencil2: *Cron-jobb uppdaterat:* \`${job.id.slice(0, 8)}\` – *${(job as any).agents?.slug ?? "?"}*/${job.task_type} "${job.title}"`,
            });
            break;
          }

          // /fia cron delete <id>
          if (cronSubCmd === "delete") {
            const jobId = args[2];
            if (!jobId) {
              await respond({ response_type: "ephemeral", text: "Usage: `/fia cron delete <id>`" });
              break;
            }

            const job = await getScheduledJob(supabase, jobId);
            await deleteScheduledJob(supabase, job.id, "slack");

            await logActivity(supabase, {
              action: "scheduled_job_deleted",
              details_json: { job_id: job.id, title: job.title, source: "slack" },
            });

            await respond({
              response_type: "in_channel",
              text: `:wastebasket: *Cron-jobb borttaget:* \`${job.id.slice(0, 8)}\` – "${job.title}"`,
            });
            break;
          }

          // /fia cron enable <id>
          if (cronSubCmd === "enable") {
            const jobId = args[2];
            if (!jobId) {
              await respond({ response_type: "ephemeral", text: "Usage: `/fia cron enable <id>`" });
              break;
            }
            const job = await enableScheduledJob(supabase, jobId, "slack");
            await respond({
              response_type: "in_channel",
              text: `:white_check_mark: Cron-jobb *aktiverat*: \`${job.id.slice(0, 8)}\` – "${job.title}"`,
            });
            break;
          }

          // /fia cron disable <id>
          if (cronSubCmd === "disable") {
            const jobId = args[2];
            if (!jobId) {
              await respond({ response_type: "ephemeral", text: "Usage: `/fia cron disable <id>`" });
              break;
            }
            const job = await disableScheduledJob(supabase, jobId, "slack");
            await respond({
              response_type: "in_channel",
              text: `:no_entry_sign: Cron-jobb *inaktiverat*: \`${job.id.slice(0, 8)}\` – "${job.title}"`,
            });
            break;
          }

          // /fia cron – list all (default)
          const jobs = await listScheduledJobs(supabase);

          if (jobs.length === 0) {
            await respond({ response_type: "ephemeral", text: "_Inga schemalagda jobb._" });
            break;
          }

          const PRIORITY_ICON: Record<string, string> = {
            critical: ":red_circle:",
            high: ":large_yellow_circle:",
            normal: ":white_circle:",
            low: ":white_circle:",
          };

          const lines = [`:calendar: *Schemalagda jobb (${jobs.length})*`];
          for (const j of jobs) {
            const agentSlug = (j as any).agents?.slug ?? "?";
            const icon = j.enabled ? ":white_check_mark:" : ":no_entry_sign:";
            const pIcon = PRIORITY_ICON[j.priority] ?? ":white_circle:";
            lines.push(
              `${icon} ${pIcon} \`${j.id.slice(0, 8)}\` \`${j.cron_expression}\` – *${agentSlug}*/${j.task_type} "${j.title}"`,
            );
          }
          lines.push(
            "",
            "_Create: `/fia cron create <agent> <task-type> <cron 5 fält> <titel>`_",
            "_Edit: `/fia cron edit <id> <fält>=<värde>`  |  Delete: `/fia cron delete <id>`_",
            "_Enable/Disable: `/fia cron enable|disable <id>`_",
          );

          await respond({ response_type: "ephemeral", text: lines.join("\n") });
        } catch (err) {
          const msg = err instanceof CronServiceError ? err.message : (err as Error).message;
          await respond({ response_type: "ephemeral", text: `:x: ${msg}` });
        }
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
          "  `/fia triggers` – Visa pending triggers som väntar på godkännande",
          "  `/fia triggers approve <id>` – Godkänn pending trigger",
          "  `/fia triggers reject <id> <reason>` – Avslå pending trigger",
          "  `/fia lineage <task-id>` – Visa task-träd (föräldrar och barn)",
          "  `/fia cron` – Lista schemalagda cron-jobb",
          "  `/fia cron create <agent> <type> <cron 5 fält> <titel>` – Skapa jobb",
          "  `/fia cron edit <id> <fält>=<värde>` – Redigera jobb",
          "  `/fia cron delete <id>` – Ta bort jobb",
          "  `/fia cron enable|disable <id>` – Aktivera/inaktivera jobb",
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
          for (const j of (dbJobs ?? []) as unknown as {
            cron_expression: string;
            title: string;
            agents: { slug: string };
          }[]) {
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
