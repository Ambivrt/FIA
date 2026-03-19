import { SupabaseClient } from "@supabase/supabase-js";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { updateTaskStatus, createApproval } from "./task-writer";
import { logActivity } from "./activity-writer";

interface Command {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export function startCommandListener(supabase: SupabaseClient, logger: Logger, killSwitch: KillSwitch): void {
  const channel = supabase
    .channel("commands")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "commands" }, async (payload) => {
      const cmd = payload.new as Command;
      logger.info(`Command received: ${cmd.type}`, {
        action: "command_received",
        details: cmd,
      });

      try {
        switch (cmd.type) {
          case "kill_switch_activate":
            await killSwitch.activate("realtime", cmd.payload.user_id as string);
            break;

          case "kill_switch_deactivate":
            await killSwitch.deactivate("realtime", cmd.payload.user_id as string);
            break;

          case "pause_agent": {
            const slug = cmd.payload.slug as string;
            await supabase.from("agents").update({ status: "paused" }).eq("slug", slug);
            await logActivity(supabase, {
              user_id: cmd.payload.user_id as string,
              action: "agent_paused",
              details_json: { slug, source: "dashboard" },
            });
            break;
          }

          case "resume_agent": {
            const slug = cmd.payload.slug as string;
            await supabase.from("agents").update({ status: "active" }).eq("slug", slug);
            await logActivity(supabase, {
              user_id: cmd.payload.user_id as string,
              action: "agent_resumed",
              details_json: { slug, source: "dashboard" },
            });
            break;
          }

          case "approve_task": {
            const taskId = cmd.payload.task_id as string;
            await updateTaskStatus(supabase, taskId, "approved");
            await createApproval(supabase, {
              task_id: taskId,
              reviewer_type: "orchestrator",
              reviewer_id: cmd.payload.user_id as string,
              decision: "approved",
              feedback: cmd.payload.feedback as string,
            });
            break;
          }

          case "reject_task": {
            const taskId = cmd.payload.task_id as string;
            await updateTaskStatus(supabase, taskId, "rejected");
            await createApproval(supabase, {
              task_id: taskId,
              reviewer_type: "orchestrator",
              reviewer_id: cmd.payload.user_id as string,
              decision: "rejected",
              feedback: cmd.payload.feedback as string,
            });
            break;
          }

          default:
            logger.warn(`Unknown command type: ${cmd.type}`, { action: "command_unknown" });
        }
      } catch (err) {
        logger.error(`Failed to process command ${cmd.type}`, {
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
