import { SupabaseClient } from "@supabase/supabase-js";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import type { DynamicScheduler } from "../gateway/scheduler";
import { updateTaskStatus, createApproval, createTask } from "./task-writer";
import { logActivity } from "./activity-writer";

interface Command {
  id: string;
  command_type: string;
  target_slug: string | null;
  payload_json: Record<string, unknown>;
  issued_by: string;
  status: string;
  created_at: string;
}

async function markCommand(supabase: SupabaseClient, commandId: string, status: "completed" | "failed"): Promise<void> {
  await supabase.from("commands").update({ status, processed_at: new Date().toISOString() }).eq("id", commandId);
}

export function startCommandListener(
  supabase: SupabaseClient,
  logger: Logger,
  killSwitch: KillSwitch,
  scheduler?: DynamicScheduler,
): void {
  supabase
    .channel("commands")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "commands" }, async (payload) => {
      const cmd = payload.new as Command;

      // Skip already-processed commands (e.g. audit-trail inserts from API routes)
      if (cmd.status === "completed" || cmd.status === "failed") {
        return;
      }

      const p = cmd.payload_json ?? {};

      logger.info(`Command received: ${cmd.command_type}`, {
        action: "command_received",
        details: { id: cmd.id, command_type: cmd.command_type, target_slug: cmd.target_slug },
      });

      try {
        switch (cmd.command_type) {
          case "kill_switch": {
            const active = p.active as boolean;
            if (active) {
              await killSwitch.activate("realtime", cmd.issued_by);
            } else {
              await killSwitch.deactivate("realtime", cmd.issued_by);
            }
            break;
          }

          case "pause_agent": {
            const slug = cmd.target_slug ?? (p.slug as string);
            if (slug) {
              await supabase.from("agents").update({ status: "paused" }).eq("slug", slug);
            } else if (p.agent_id) {
              await supabase
                .from("agents")
                .update({ status: "paused" })
                .eq("id", p.agent_id as string);
            }
            await logActivity(supabase, {
              user_id: cmd.issued_by,
              action: "agent_paused",
              details_json: { slug: slug ?? p.agent_id, source: "dashboard" },
            });
            break;
          }

          case "resume_agent": {
            const slug = cmd.target_slug ?? (p.slug as string);
            if (slug) {
              await supabase.from("agents").update({ status: "active" }).eq("slug", slug);
            } else if (p.agent_id) {
              await supabase
                .from("agents")
                .update({ status: "active" })
                .eq("id", p.agent_id as string);
            }
            await logActivity(supabase, {
              user_id: cmd.issued_by,
              action: "agent_resumed",
              details_json: { slug: slug ?? p.agent_id, source: "dashboard" },
            });
            break;
          }

          case "approve_task": {
            const taskId = p.task_id as string;
            await updateTaskStatus(supabase, taskId, "approved");
            await createApproval(supabase, {
              task_id: taskId,
              reviewer_type: "orchestrator",
              reviewer_id: cmd.issued_by,
              decision: "approved",
              feedback: p.feedback as string | undefined,
            });
            break;
          }

          case "reject_task": {
            const taskId = p.task_id as string;
            await updateTaskStatus(supabase, taskId, "rejected");
            await createApproval(supabase, {
              task_id: taskId,
              reviewer_type: "orchestrator",
              reviewer_id: cmd.issued_by,
              decision: "rejected",
              feedback: p.feedback as string | undefined,
            });
            break;
          }

          case "revision_task": {
            const taskId = p.task_id as string;
            const feedback = p.feedback as string | undefined;

            // 1. Mark original as revision_requested
            await updateTaskStatus(supabase, taskId, "revision_requested");

            // 2. Log approval
            await createApproval(supabase, {
              task_id: taskId,
              reviewer_type: "orchestrator",
              reviewer_id: cmd.issued_by,
              decision: "revision_requested",
              feedback,
            });

            // 3. Fetch original task and create new queued task
            const { data: original } = await supabase
              .from("tasks")
              .select("agent_id, type, title, priority, content_json")
              .eq("id", taskId)
              .single();

            if (original) {
              const existingContent = (original.content_json as Record<string, unknown>) ?? {};
              await createTask(supabase, {
                agent_id: original.agent_id,
                type: original.type,
                title: original.title,
                priority: original.priority,
                status: "queued",
                source: "dashboard",
                content_json: {
                  ...existingContent,
                  revision_feedback: feedback ?? null,
                  original_task_id: taskId,
                },
              });
            }
            break;
          }

          case "update_schedule": {
            if (scheduler) {
              await scheduler.reload();
              await logActivity(supabase, {
                user_id: cmd.issued_by,
                action: "schedule_reloaded",
                details_json: { source: "dashboard", ...p },
              });
            }
            break;
          }

          default:
            logger.warn(`Unknown command type: ${cmd.command_type}`, { action: "command_unknown" });
        }

        await markCommand(supabase, cmd.id, "completed");
        logger.info(`Command processed: ${cmd.command_type}`, {
          action: "command_processed",
          details: { id: cmd.id },
        });
      } catch (err) {
        await markCommand(supabase, cmd.id, "failed").catch(() => {});
        logger.error(`Failed to process command ${cmd.command_type}`, {
          action: "command_error",
          error: (err as Error).message,
        });
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        logger.info("Command listener subscribed", { action: "command_listener_start" });
      } else if (status === "CHANNEL_ERROR") {
        logger.warn("Command listener channel error – commands via Realtime unavailable", {
          action: "command_listener_error",
        });
      }
    });
}
