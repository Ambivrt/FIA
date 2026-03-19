import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { TaskQueue } from "../gateway/task-queue";
import { logActivity } from "./activity-writer";
import { createAgent } from "../agents/agent-factory";
import { ProgressCallback } from "../agents/base-agent";

interface TaskRow {
  id: string;
  agent_id: string;
  type: string;
  title: string;
  priority: string;
  source: string | null;
  content_json: Record<string, unknown> | null;
}

/**
 * Listens for externally created tasks (e.g. from Dashboard) via Supabase Realtime.
 * Only picks up tasks where source != 'gateway' to avoid double-processing.
 */
export function startTaskListener(
  supabase: SupabaseClient,
  config: AppConfig,
  logger: Logger,
  killSwitch: KillSwitch,
  taskQueue: TaskQueue | null,
): void {
  const channel = supabase
    .channel("gateway-tasks")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tasks", filter: "status=eq.queued" },
      async (payload) => {
        const task = payload.new as TaskRow;

        // Skip tasks created by the gateway itself
        if (task.source === "gateway") return;

        logger.info(`External task received: ${task.id} (${task.type})`, {
          action: "external_task_received",
          details: { task_id: task.id, type: task.type, source: task.source },
        });

        if (killSwitch.isActive()) {
          logger.info(`Skipping external task ${task.id} – kill switch active`, {
            action: "external_task_skipped",
            details: { task_id: task.id, reason: "kill_switch" },
          });
          return;
        }

        // Resolve agent slug from agent_id
        const { data: agentRow } = await supabase
          .from("agents")
          .select("slug, status")
          .eq("id", task.agent_id)
          .single();

        if (!agentRow) {
          logger.warn(`External task ${task.id}: unknown agent_id ${task.agent_id}`, {
            action: "external_task_error",
            details: { task_id: task.id },
          });
          return;
        }

        if (agentRow.status === "paused") {
          logger.info(`Skipping external task ${task.id} – agent ${agentRow.slug} is paused`, {
            action: "external_task_skipped",
            details: { task_id: task.id, agent: agentRow.slug, reason: "agent_paused" },
          });
          return;
        }

        const agentSlug = agentRow.slug as string;
        const taskInput = (task.content_json?.description as string) || task.title;

        await logActivity(supabase, {
          agent_id: task.agent_id,
          action: "task_picked_up_external",
          details_json: { task_id: task.id, type: task.type, source: task.source },
        });

        if (taskQueue) {
          const onProgress: ProgressCallback = async (action, message, details) => {
            await logActivity(supabase, {
              agent_id: task.agent_id,
              action,
              details_json: { agent: agentSlug, external: true, ...details },
            });
          };

          taskQueue.enqueue(
            agentSlug,
            {
              type: task.type,
              title: task.title,
              input: taskInput,
              priority: task.priority || "normal",
              existingTaskId: task.id,
              onProgress,
            },
            task.priority || "normal",
          );

          logger.info(`External task ${task.id} enqueued for ${agentSlug}`, {
            action: "external_task_enqueued",
            details: { task_id: task.id, agent: agentSlug },
          });
        } else {
          // Direct execution fallback
          try {
            const agent = createAgent(agentSlug, config, logger, supabase);
            const onProgress: ProgressCallback = async (action, message, details) => {
              await logActivity(supabase, {
                agent_id: task.agent_id,
                action,
                details_json: { agent: agentSlug, external: true, ...details },
              });
            };

            await agent.execute({
              type: task.type,
              title: task.title,
              input: taskInput,
              priority: task.priority || "normal",
              existingTaskId: task.id,
              onProgress,
            });
          } catch (err) {
            logger.error(`External task ${task.id} failed: ${(err as Error).message}`, {
              action: "external_task_error",
              details: { task_id: task.id, error: (err as Error).message },
            });
          }
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        logger.info("Task listener subscribed (external tasks)", { action: "task_listener_start" });
      } else if (status === "CHANNEL_ERROR") {
        logger.warn("Task listener channel error – external task pickup unavailable", {
          action: "task_listener_error",
        });
      }
    });
}
