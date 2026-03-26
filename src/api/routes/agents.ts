import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requirePermission, getDbUserId } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logActivity } from "../../supabase/activity-writer";
import { KillSwitch } from "../../utils/kill-switch";
import { resolveDisplayStatus } from "../../shared/display-status";
import { triggersPatchSchema, reseedSchema, TriggerPatchItem } from "../schemas/trigger-config";
import { TriggerConfig } from "../../engine/trigger-types";
import { loadAgentManifest } from "../../agents/agent-loader";
import { AppConfig } from "../../utils/config";

const modelAliasEnum = z.enum([
  "claude-opus",
  "claude-sonnet",
  "gemini-pro",
  "gemini-flash",
  "nano-banana-2",
  "google-search",
]);

const routingSchema = z.object({
  routing: z.record(
    z.string(),
    z.union([
      modelAliasEnum,
      z.object({
        primary: modelAliasEnum,
        fallback: modelAliasEnum.optional(),
      }),
    ]),
  ),
});

const toolsSchema = z.object({
  tools: z.array(z.string().min(1).max(100)),
});

export function agentRoutes(supabase: SupabaseClient, killSwitch: KillSwitch, config?: AppConfig): Router {
  const router = Router();

  // GET /api/agents – all authenticated users
  router.get("/", async (req, res) => {
    try {
      const { data: agents, error } = await supabase.from("agents").select("*").order("name");

      if (error) throw error;

      const today = new Date().toISOString().slice(0, 10);

      const killSwitchActive = killSwitch.isActive();

      const enriched = await Promise.all(
        (agents ?? []).map(async (agent) => {
          const { data: tasks } = await supabase
            .from("tasks")
            .select("status")
            .eq("agent_id", agent.id)
            .gte("created_at", `${today}T00:00:00Z`);

          const counts: Record<string, number> = {};
          for (const t of tasks ?? []) {
            counts[t.status] = (counts[t.status] ?? 0) + 1;
          }

          const running_task_count = counts["in_progress"] ?? 0;
          const display_status = resolveDisplayStatus(agent, killSwitchActive, running_task_count > 0);

          return { ...agent, tasks_today: counts, running_task_count, display_status };
        }),
      );

      res.json({ data: enriched });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/agents/:slug/pause – orchestrator, admin
  router.post("/:slug/pause", requirePermission("pause_resume_agents"), async (req, res) => {
    try {
      const { slug } = req.params;
      const { data, error } = await supabase
        .from("agents")
        .update({ status: "paused" })
        .eq("slug", slug)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${slug}' not found.` } });
        return;
      }

      await logActivity(supabase, {
        agent_id: data.id,
        user_id: getDbUserId(req),
        action: "agent_paused",
        details_json: { slug },
      });

      // Audit trail
      await supabase.from("commands").insert({
        command_type: "pause_agent",
        target_slug: slug,
        payload_json: { slug, source: "api" },
        issued_by: getDbUserId(req) ?? null,
        status: "completed",
        processed_at: new Date().toISOString(),
      });

      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/agents/:slug/resume – orchestrator, admin
  router.post("/:slug/resume", requirePermission("pause_resume_agents"), async (req, res) => {
    try {
      const { slug } = req.params;
      const { data, error } = await supabase
        .from("agents")
        .update({ status: "active" })
        .eq("slug", slug)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${slug}' not found.` } });
        return;
      }

      await logActivity(supabase, {
        agent_id: data.id,
        user_id: getDbUserId(req),
        action: "agent_resumed",
        details_json: { slug },
      });

      // Audit trail
      await supabase.from("commands").insert({
        command_type: "resume_agent",
        target_slug: slug,
        payload_json: { slug, source: "api" },
        issued_by: getDbUserId(req) ?? null,
        status: "completed",
        processed_at: new Date().toISOString(),
      });

      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // PATCH /api/agents/:slug/routing – admin only
  router.patch(
    "/:slug/routing",
    requirePermission("agent_routing_tools"),
    validateBody(routingSchema),
    async (req, res) => {
      try {
        const { slug } = req.params;
        const { routing } = req.body;

        const { data: agent, error: fetchErr } = await supabase
          .from("agents")
          .select("id, config_json")
          .eq("slug", slug)
          .single();

        if (fetchErr || !agent) {
          res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${slug}' not found.` } });
          return;
        }

        const current = (agent.config_json as Record<string, unknown>) ?? {};
        const adminOverrides = new Set((current._admin_overrides as string[]) ?? []);
        adminOverrides.add("routing");
        const merged = { ...current, routing, _admin_overrides: [...adminOverrides] };

        const { error } = await supabase.from("agents").update({ config_json: merged }).eq("id", agent.id);

        if (error) throw error;

        await logActivity(supabase, {
          agent_id: agent.id,
          user_id: getDbUserId(req),
          action: "routing_updated",
          details_json: { slug, routing },
        });

        res.json({ data: { slug, routing } });
      } catch (err) {
        res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
      }
    },
  );

  // PATCH /api/agents/:slug/tools – admin only
  router.patch(
    "/:slug/tools",
    requirePermission("agent_routing_tools"),
    validateBody(toolsSchema),
    async (req, res) => {
      try {
        const { slug } = req.params;
        const { tools } = req.body;

        const { data: agent, error: fetchErr } = await supabase
          .from("agents")
          .select("id, config_json")
          .eq("slug", slug)
          .single();

        if (fetchErr || !agent) {
          res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${slug}' not found.` } });
          return;
        }

        const current = (agent.config_json as Record<string, unknown>) ?? {};
        const adminOverrides = new Set((current._admin_overrides as string[]) ?? []);
        adminOverrides.add("tools");
        const merged = { ...current, tools, _admin_overrides: [...adminOverrides] };

        const { error } = await supabase.from("agents").update({ config_json: merged }).eq("id", agent.id);

        if (error) throw error;

        await logActivity(supabase, {
          agent_id: agent.id,
          user_id: getDbUserId(req),
          action: "tools_updated",
          details_json: { slug, tools },
        });

        res.json({ data: { slug, tools } });
      } catch (err) {
        res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
      }
    },
  );

  // GET /api/agents/:slug/triggers – all authenticated users
  router.get("/:slug/triggers", async (req, res) => {
    try {
      const { slug } = req.params;

      const { data: agent, error } = await supabase.from("agents").select("config_json").eq("slug", slug).single();

      if (error || !agent) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${slug}' not found.` } });
        return;
      }

      const configJson = agent.config_json as Record<string, unknown> | null;
      const triggers = (configJson?.triggers as TriggerConfig[]) ?? [];

      res.json({ agent_slug: slug, triggers });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // PATCH /api/agents/:slug/triggers – orchestrator, admin
  router.patch(
    "/:slug/triggers",
    requirePermission("manage_triggers"),
    validateBody(triggersPatchSchema),
    async (req, res) => {
      try {
        const { slug } = req.params;
        const { triggers: patches } = req.body as { triggers: TriggerPatchItem[] };

        const { data: agent, error: fetchErr } = await supabase
          .from("agents")
          .select("id, config_json")
          .eq("slug", slug)
          .single();

        if (fetchErr || !agent) {
          res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${slug}' not found.` } });
          return;
        }

        const current = (agent.config_json as Record<string, unknown>) ?? {};
        const existingTriggers = (current.triggers as TriggerConfig[]) ?? [];

        // Validate all patch names exist
        const existingNames = new Set(existingTriggers.map((t) => t.name));
        const notFound = patches.filter((p) => !existingNames.has(p.name));
        if (notFound.length > 0) {
          res.status(404).json({
            error: {
              code: "NOT_FOUND",
              message: `Trigger(s) not found: ${notFound.map((p) => p.name).join(", ")}`,
            },
          });
          return;
        }

        // Validate target_agent references
        const validationErrors: Array<{ trigger: string; field: string; issue: string }> = [];
        for (const patch of patches) {
          if (patch.action?.target_agent) {
            const { data: targetAgent } = await supabase
              .from("agents")
              .select("id")
              .eq("slug", patch.action.target_agent)
              .single();

            if (!targetAgent) {
              validationErrors.push({
                trigger: patch.name,
                field: "action.target_agent",
                issue: `Agenten '${patch.action.target_agent}' finns inte.`,
              });
            }
          }
        }

        if (validationErrors.length > 0) {
          res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: validationErrors.map((e) => `Trigger '${e.trigger}': ${e.issue}`).join(" "),
              details: validationErrors,
            },
          });
          return;
        }

        // Build change log and merge
        const changes: Record<string, Record<string, { from: unknown; to: unknown }>> = {};
        const updatedNames: string[] = [];

        const updatedTriggers = existingTriggers.map((trigger) => {
          const patch = patches.find((p) => p.name === trigger.name);
          if (!patch) return trigger;

          const triggerChanges: Record<string, { from: unknown; to: unknown }> = {};
          const merged = { ...trigger };

          // Merge top-level fields
          if (patch.enabled !== undefined && patch.enabled !== trigger.enabled) {
            triggerChanges.enabled = { from: trigger.enabled, to: patch.enabled };
            merged.enabled = patch.enabled;
          }
          if (patch.requires_approval !== undefined && patch.requires_approval !== trigger.requires_approval) {
            triggerChanges.requires_approval = { from: trigger.requires_approval, to: patch.requires_approval };
            merged.requires_approval = patch.requires_approval;
          }

          // Merge condition
          if (patch.condition) {
            merged.condition = { ...trigger.condition, ...patch.condition };
            for (const [key, value] of Object.entries(patch.condition)) {
              const oldVal = trigger.condition?.[key as keyof typeof trigger.condition];
              if (JSON.stringify(oldVal) !== JSON.stringify(value)) {
                triggerChanges[`condition.${key}`] = { from: oldVal, to: value };
              }
            }
          }

          // Merge action (preserve type — immutable)
          if (patch.action) {
            merged.action = { ...trigger.action, ...patch.action, type: trigger.action.type };
            for (const [key, value] of Object.entries(patch.action)) {
              if (key === "type") continue;
              const oldVal = trigger.action?.[key as keyof typeof trigger.action];
              if (JSON.stringify(oldVal) !== JSON.stringify(value)) {
                triggerChanges[`action.${key}`] = { from: oldVal, to: value };
              }
            }
          }

          if (Object.keys(triggerChanges).length > 0) {
            changes[trigger.name] = triggerChanges;
            updatedNames.push(trigger.name);
          }

          return merged;
        });

        // Write to Supabase
        const adminOverrides = new Set((current._admin_overrides as string[]) ?? []);
        adminOverrides.add("triggers");
        const merged = { ...current, triggers: updatedTriggers, _admin_overrides: [...adminOverrides] };

        const { error } = await supabase.from("agents").update({ config_json: merged }).eq("id", agent.id);
        if (error) throw error;

        // Activity log
        await logActivity(supabase, {
          agent_id: agent.id,
          user_id: getDbUserId(req),
          action: "trigger_config_updated",
          details_json: { updated_triggers: updatedNames, changes },
        });

        res.json({ agent_slug: slug, updated: updatedNames, triggers: updatedTriggers });
      } catch (err) {
        res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
      }
    },
  );

  // POST /api/agents/:slug/triggers/reseed – admin only
  router.post(
    "/:slug/triggers/reseed",
    requirePermission("knowledge_reseed"),
    validateBody(reseedSchema),
    async (req, res) => {
      try {
        const slug = req.params.slug as string;
        const confirm = req.body?.confirm === true;

        const { data: agent, error: fetchErr } = await supabase
          .from("agents")
          .select("id, config_json")
          .eq("slug", slug)
          .single();

        if (fetchErr || !agent) {
          res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${slug}' not found.` } });
          return;
        }

        const current = (agent.config_json as Record<string, unknown>) ?? {};
        const currentTriggers = (current.triggers as TriggerConfig[]) ?? [];

        // Load YAML triggers
        let yamlTriggers: TriggerConfig[] = [];
        if (config) {
          try {
            const manifest = loadAgentManifest(config.knowledgeDir, slug);
            yamlTriggers = manifest.triggers ?? [];
          } catch {
            // No manifest or invalid
          }
        }

        // Compute diff
        const changes: Array<{ trigger: string; diff: string }> = [];
        for (const yt of yamlTriggers) {
          const ct = currentTriggers.find((t) => t.name === yt.name);
          if (!ct) {
            changes.push({ trigger: yt.name, diff: "Ny i YAML (läggs till)" });
          } else if (JSON.stringify(ct) !== JSON.stringify(yt)) {
            const diffs: string[] = [];
            if (ct.enabled !== yt.enabled) diffs.push(`enabled: ${ct.enabled} → ${yt.enabled}`);
            if (ct.requires_approval !== yt.requires_approval)
              diffs.push(`requires_approval: ${ct.requires_approval} → ${yt.requires_approval}`);
            if (JSON.stringify(ct.condition) !== JSON.stringify(yt.condition)) diffs.push("condition changed");
            if (JSON.stringify(ct.action) !== JSON.stringify(yt.action)) diffs.push("action changed");
            changes.push({ trigger: yt.name, diff: diffs.join(", ") || "minor changes" });
          }
        }
        for (const ct of currentTriggers) {
          if (!yamlTriggers.find((yt) => yt.name === ct.name)) {
            changes.push({ trigger: ct.name, diff: "Finns bara i dashboard (tas bort)" });
          }
        }

        if (!confirm) {
          res.json({
            dry_run: true,
            agents: [
              {
                slug,
                current_trigger_count: currentTriggers.length,
                yaml_trigger_count: yamlTriggers.length,
                changes,
              },
            ],
          });
          return;
        }

        // Perform reseed
        const previousTriggers = currentTriggers;
        const adminOverrides = new Set((current._admin_overrides as string[]) ?? []);
        adminOverrides.delete("triggers");
        const merged = {
          ...current,
          triggers: yamlTriggers,
          _yaml_triggers: yamlTriggers,
          _admin_overrides: [...adminOverrides],
        };

        const { error } = await supabase.from("agents").update({ config_json: merged }).eq("id", agent.id);
        if (error) throw error;

        await logActivity(supabase, {
          agent_id: agent.id,
          user_id: getDbUserId(req),
          action: "trigger_config_reseeded",
          details_json: {
            scope: "single",
            agents_reseeded: [slug],
            previous_triggers: previousTriggers,
          },
        });

        res.json({
          dry_run: false,
          reseeded: [slug],
          unchanged: [],
          message: `Agent '${slug}' reseedad från agent.yaml.`,
        });
      } catch (err) {
        res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
      }
    },
  );

  return router;
}
