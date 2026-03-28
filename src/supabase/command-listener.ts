import { SupabaseClient } from "@supabase/supabase-js";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import type { DynamicScheduler } from "../gateway/scheduler";
import { updateTaskStatus, createApproval, createTask } from "./task-writer";
import { logActivity } from "./activity-writer";
import { loadAgentManifest } from "../agents/agent-loader";
import { getAllAgentSlugs } from "../agents/agent-factory";
import { TriggerConfig } from "../engine/trigger-types";
import { AppConfig } from "../utils/config";
import { manuallyFireTrigger } from "../engine/trigger-engine";
import { seedAllKnowledge, seedAgentKnowledge } from "../knowledge/knowledge-seeder";
import { checkDriveAuth, setupDriveFolders } from "../mcp/drive-setup";
import { handleGwsToolUse } from "../mcp/gws";

interface Command {
  id: string;
  command_type: string;
  target_slug: string | null;
  payload_json: Record<string, unknown>;
  issued_by: string;
  status: string;
  created_at: string;
}

async function markCommand(
  supabase: SupabaseClient,
  commandId: string,
  status: "completed" | "failed",
  resultJson?: unknown,
): Promise<void> {
  const update: Record<string, unknown> = { status, processed_at: new Date().toISOString() };
  if (resultJson !== undefined) update.result_json = resultJson;
  await supabase.from("commands").update(update).eq("id", commandId);
}

export function startCommandListener(
  supabase: SupabaseClient,
  logger: Logger,
  killSwitch: KillSwitch,
  scheduler?: DynamicScheduler,
  appConfig?: AppConfig,
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

          case "reseed_triggers": {
            if (!appConfig) {
              logger.warn("reseed_triggers: appConfig not available", { action: "reseed_triggers_error" });
              break;
            }

            const targetSlug = cmd.target_slug ?? (p.slug as string | undefined);
            const slugsToReseed = targetSlug ? [targetSlug] : getAllAgentSlugs();
            const reseeded: string[] = [];

            for (const slug of slugsToReseed) {
              const { data: agentRow } = await supabase
                .from("agents")
                .select("id, config_json")
                .eq("slug", slug)
                .single();

              if (!agentRow) continue;

              let yamlTriggers: TriggerConfig[] = [];
              try {
                const manifest = loadAgentManifest(appConfig.knowledgeDir, slug);
                yamlTriggers = manifest.triggers ?? [];
              } catch {
                continue;
              }

              const currentCfg = (agentRow.config_json as Record<string, unknown>) ?? {};
              const currentTriggers = (currentCfg.triggers as TriggerConfig[]) ?? [];

              if (JSON.stringify(currentTriggers) === JSON.stringify(yamlTriggers)) continue;

              const adminOverrides = new Set((currentCfg._admin_overrides as string[]) ?? []);
              adminOverrides.delete("triggers");
              const merged = {
                ...currentCfg,
                triggers: yamlTriggers,
                _yaml_triggers: yamlTriggers,
                _admin_overrides: [...adminOverrides],
              };

              await supabase.from("agents").update({ config_json: merged }).eq("id", agentRow.id);
              reseeded.push(slug);
            }

            await logActivity(supabase, {
              user_id: cmd.issued_by,
              action: "trigger_config_reseeded",
              details_json: {
                scope: targetSlug ? "single" : "all",
                agents_reseeded: reseeded,
                source: "dashboard",
              },
            });

            logger.info(`Triggers reseeded: ${reseeded.join(", ") || "none"}`, {
              action: "reseed_triggers_complete",
            });
            break;
          }

          case "reseed_routing": {
            if (!appConfig) {
              logger.warn("reseed_routing: appConfig not available", { action: "reseed_routing_error" });
              break;
            }

            const routingTargetSlug = cmd.target_slug ?? (p.slug as string | undefined);
            const routingSlugsToReseed = routingTargetSlug ? [routingTargetSlug] : getAllAgentSlugs();
            const routingReseeded: string[] = [];

            for (const slug of routingSlugsToReseed) {
              const { data: agentRow } = await supabase
                .from("agents")
                .select("id, config_json")
                .eq("slug", slug)
                .single();

              if (!agentRow) continue;

              let yamlRouting: Record<string, unknown> = {};
              try {
                const manifest = loadAgentManifest(appConfig.knowledgeDir, slug);
                yamlRouting = manifest.routing ?? {};
              } catch {
                continue;
              }

              const currentCfg = (agentRow.config_json as Record<string, unknown>) ?? {};
              const currentRouting = (currentCfg.routing as Record<string, unknown>) ?? {};

              if (JSON.stringify(currentRouting) === JSON.stringify(yamlRouting)) continue;

              const adminOverrides = new Set((currentCfg._admin_overrides as string[]) ?? []);
              adminOverrides.delete("routing");
              const merged = {
                ...currentCfg,
                routing: yamlRouting,
                _yaml_routing: yamlRouting,
                _admin_overrides: [...adminOverrides],
              };

              await supabase.from("agents").update({ config_json: merged }).eq("id", agentRow.id);
              routingReseeded.push(slug);
            }

            await logActivity(supabase, {
              user_id: cmd.issued_by,
              action: "routing_config_reseeded",
              details_json: {
                scope: routingTargetSlug ? "single" : "all",
                agents_reseeded: routingReseeded,
                source: "dashboard",
              },
            });

            logger.info(`Routing reseeded: ${routingReseeded.join(", ") || "none"}`, {
              action: "reseed_routing_complete",
            });
            break;
          }

          case "reseed_knowledge": {
            if (!appConfig) {
              logger.warn("reseed_knowledge: appConfig not available", { action: "reseed_knowledge_error" });
              break;
            }

            const knowledgeSlug = cmd.target_slug ?? (p.slug as string | undefined);
            let diffs;

            if (knowledgeSlug) {
              const diff = await seedAgentKnowledge(supabase, appConfig, knowledgeSlug, false);
              diffs = [diff];
            } else {
              diffs = await seedAllKnowledge(supabase, appConfig, false);
            }

            const totalItems = diffs.reduce((s, d) => s + d.added, 0);

            await logActivity(supabase, {
              user_id: cmd.issued_by,
              action: "knowledge_reseeded",
              details_json: {
                scope: knowledgeSlug ? "single" : "all",
                agent_slug: knowledgeSlug,
                agents: diffs.map((d) => d.slug),
                total_items: totalItems,
                source: "dashboard",
              },
            });

            logger.info(`Knowledge reseeded: ${diffs.map((d) => `${d.slug}(${d.added})`).join(", ")}`, {
              action: "reseed_knowledge_complete",
            });
            break;
          }

          case "fire_trigger": {
            if (!appConfig) {
              logger.warn("fire_trigger: appConfig not available", { action: "fire_trigger_error" });
              break;
            }

            const triggerSlug = cmd.target_slug ?? (p.agent_slug as string);
            const triggerName = p.trigger_name as string;

            if (!triggerSlug || !triggerName) {
              logger.warn("fire_trigger: missing agent_slug or trigger_name", { action: "fire_trigger_error" });
              break;
            }

            const result = await manuallyFireTrigger(
              supabase,
              triggerSlug,
              triggerName,
              appConfig.knowledgeDir,
              logger,
            );

            await logActivity(supabase, {
              user_id: cmd.issued_by,
              action: "trigger_manually_fired",
              details_json: {
                agent_slug: triggerSlug,
                trigger_name: triggerName,
                success: result.success,
                message: result.message,
                source: "dashboard",
              },
            });

            await markCommand(supabase, cmd.id, result.success ? "completed" : "failed", result);
            return; // Already marked
          }

          case "drive_setup": {
            if (!appConfig) {
              logger.warn("drive_setup: appConfig not available", { action: "drive_setup_error" });
              break;
            }

            const dryRun = p.dry_run === true;
            await checkDriveAuth(appConfig);
            const setupResult = await setupDriveFolders(appConfig, supabase, dryRun);

            if (!dryRun) {
              await logActivity(supabase, {
                user_id: cmd.issued_by,
                action: "drive_setup",
                details_json: {
                  created: setupResult.created.length,
                  existing: setupResult.existing.length,
                  errors: setupResult.errors.length,
                  source: "dashboard",
                },
              });
            }

            await markCommand(supabase, cmd.id, "completed", {
              dry_run: dryRun,
              created: setupResult.created,
              existing: setupResult.existing,
              errors: setupResult.errors,
            });
            return; // Already marked
          }

          case "drive_list_folder": {
            if (!appConfig) {
              logger.warn("drive_list_folder: appConfig not available", { action: "drive_list_error" });
              break;
            }

            const folderId = p.folder_id as string;
            const maxResults = Math.min((p.max_results as number) || 50, 200);

            const raw = await handleGwsToolUse(
              { toolName: "drive_list_folder_contents", input: { folderId, pageSize: maxResults } },
              appConfig,
            );

            let files: unknown[] = [];
            try {
              const parsed = JSON.parse(raw);
              if (parsed.content && Array.isArray(parsed.content)) {
                const text = parsed.content.map((c: { text?: string }) => c.text ?? "").join("");
                let inner: Record<string, unknown> | unknown[];
                try {
                  inner = JSON.parse(text);
                } catch {
                  // ResponseFormatter prepends human-readable text before JSON
                  const idx = text.lastIndexOf("\n\n{");
                  inner = idx !== -1 ? JSON.parse(text.slice(idx + 2)) : {};
                }
                files = Array.isArray(inner) ? inner : ((inner as Record<string, unknown>).files as unknown[]) ?? [];
              } else if (Array.isArray(parsed)) {
                files = parsed;
              } else if (parsed.files && Array.isArray(parsed.files)) {
                files = parsed.files;
              }
            } catch {
              // Return empty list if unparseable
            }

            await markCommand(supabase, cmd.id, "completed", { files });
            return; // Already marked
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
