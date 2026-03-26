import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requirePermission, getDbUserId } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logActivity } from "../../supabase/activity-writer";
import { createTask } from "../../supabase/task-writer";
import { reseedSchema } from "../schemas/trigger-config";
import { TriggerConfig } from "../../engine/trigger-types";
import { loadAgentManifest } from "../../agents/agent-loader";
import { getAllAgentSlugs } from "../../agents/agent-factory";
import { AppConfig } from "../../utils/config";

const rejectSchema = z.object({
  reason: z.string().min(1, "Reason is required."),
});

export function triggerRoutes(supabase: SupabaseClient, config?: AppConfig): Router {
  const router = Router();

  // GET /api/triggers/pending
  router.get("/pending", requirePermission("manage_triggers"), async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("pending_triggers")
        .select("*, tasks!source_task_id(id, title, type, status, agent_id, agents(slug, name))")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      res.json({ data: data ?? [] });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/triggers/:id/approve
  router.post("/:id/approve", requirePermission("manage_triggers"), async (req, res) => {
    try {
      const triggerId = req.params.id;

      // Fetch the pending trigger
      const { data: trigger, error: fetchErr } = await supabase
        .from("pending_triggers")
        .select("*")
        .eq("id", triggerId)
        .eq("status", "pending")
        .single();

      if (fetchErr || !trigger) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Pending trigger not found." } });
        return;
      }

      // Resolve target agent
      const { data: targetAgent } = await supabase
        .from("agents")
        .select("id")
        .eq("slug", trigger.target_agent_slug)
        .single();

      if (!targetAgent) {
        res
          .status(400)
          .json({ error: { code: "BAD_REQUEST", message: `Target agent '${trigger.target_agent_slug}' not found.` } });
        return;
      }

      // Create the downstream task
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

      // Update pending trigger status
      await supabase
        .from("pending_triggers")
        .update({
          status: "executed",
          decided_by: getDbUserId(req),
          decided_at: new Date().toISOString(),
        })
        .eq("id", triggerId);

      // Update source task to triggered
      await supabase.from("tasks").update({ status: "triggered" }).eq("id", trigger.source_task_id);

      await logActivity(supabase, {
        user_id: getDbUserId(req),
        action: "trigger_approved",
        details_json: {
          trigger_id: triggerId,
          trigger_name: trigger.trigger_name,
          source_task_id: trigger.source_task_id,
          new_task_id: newTaskId,
        },
      });

      res.json({ data: { id: triggerId, status: "executed", new_task_id: newTaskId } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/triggers/:id/reject
  router.post("/:id/reject", requirePermission("manage_triggers"), validateBody(rejectSchema), async (req, res) => {
    try {
      const triggerId = req.params.id;
      const { reason } = req.body;

      const { data: trigger, error: fetchErr } = await supabase
        .from("pending_triggers")
        .select("*")
        .eq("id", triggerId)
        .eq("status", "pending")
        .single();

      if (fetchErr || !trigger) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Pending trigger not found." } });
        return;
      }

      await supabase
        .from("pending_triggers")
        .update({
          status: "rejected",
          decided_by: getDbUserId(req),
          decided_at: new Date().toISOString(),
        })
        .eq("id", triggerId);

      await logActivity(supabase, {
        user_id: getDbUserId(req),
        action: "trigger_rejected",
        details_json: {
          trigger_id: triggerId,
          trigger_name: trigger.trigger_name,
          reason,
        },
      });

      res.json({ data: { id: triggerId, status: "rejected" } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/triggers/reseed – admin only (all agents)
  router.post("/reseed", requirePermission("knowledge_reseed"), validateBody(reseedSchema), async (req, res) => {
    try {
      const confirm = req.body?.confirm === true;

      if (!config) {
        res
          .status(500)
          .json({ error: { code: "CONFIG_MISSING", message: "Gateway config not available for YAML loading." } });
        return;
      }

      const slugs = getAllAgentSlugs();
      const agentDiffs: Array<{
        slug: string;
        current_trigger_count: number;
        yaml_trigger_count: number;
        changes: Array<{ trigger: string; diff: string }>;
      }> = [];

      for (const slug of slugs) {
        const { data: agent } = await supabase.from("agents").select("id, config_json").eq("slug", slug).single();

        if (!agent) continue;

        const current = (agent.config_json as Record<string, unknown>) ?? {};
        const currentTriggers = (current.triggers as TriggerConfig[]) ?? [];

        let yamlTriggers: TriggerConfig[] = [];
        try {
          const manifest = loadAgentManifest(config.knowledgeDir, slug);
          yamlTriggers = manifest.triggers ?? [];
        } catch {
          // No manifest
        }

        const changes: Array<{ trigger: string; diff: string }> = [];
        for (const yt of yamlTriggers) {
          const ct = currentTriggers.find((t) => t.name === yt.name);
          if (!ct) {
            changes.push({ trigger: yt.name, diff: "Ny i YAML" });
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
            changes.push({ trigger: ct.name, diff: "Finns bara i dashboard" });
          }
        }

        agentDiffs.push({
          slug,
          current_trigger_count: currentTriggers.length,
          yaml_trigger_count: yamlTriggers.length,
          changes,
        });
      }

      if (!confirm) {
        res.json({ dry_run: true, agents: agentDiffs });
        return;
      }

      // Perform reseed for all agents
      const reseeded: string[] = [];
      const unchanged: string[] = [];

      for (const slug of slugs) {
        const { data: agent } = await supabase.from("agents").select("id, config_json").eq("slug", slug).single();

        if (!agent) continue;

        let yamlTriggers: TriggerConfig[] = [];
        try {
          const manifest = loadAgentManifest(config.knowledgeDir, slug);
          yamlTriggers = manifest.triggers ?? [];
        } catch {
          continue;
        }

        const current = (agent.config_json as Record<string, unknown>) ?? {};
        const currentTriggers = (current.triggers as TriggerConfig[]) ?? [];

        if (JSON.stringify(currentTriggers) === JSON.stringify(yamlTriggers)) {
          unchanged.push(slug);
          continue;
        }

        const adminOverrides = new Set((current._admin_overrides as string[]) ?? []);
        adminOverrides.delete("triggers");
        const merged = {
          ...current,
          triggers: yamlTriggers,
          _yaml_triggers: yamlTriggers,
          _admin_overrides: [...adminOverrides],
        };

        await supabase.from("agents").update({ config_json: merged }).eq("id", agent.id);
        reseeded.push(slug);
      }

      await logActivity(supabase, {
        user_id: getDbUserId(req),
        action: "trigger_config_reseeded",
        details_json: {
          scope: "all",
          agents_reseeded: reseeded,
        },
      });

      res.json({
        dry_run: false,
        reseeded,
        unchanged,
        message: `${reseeded.length} agenter reseedade från agent.yaml.`,
      });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  return router;
}
