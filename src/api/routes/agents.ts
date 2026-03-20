import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logActivity } from "../../supabase/activity-writer";

const modelAliasEnum = z.enum(["claude-opus", "claude-sonnet", "nano-banana-2", "google-search"]);

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

export function agentRoutes(supabase: SupabaseClient): Router {
  const router = Router();

  // GET /api/agents – all authenticated users
  router.get("/", async (req, res) => {
    try {
      const { data: agents, error } = await supabase.from("agents").select("*").order("name");

      if (error) throw error;

      const today = new Date().toISOString().slice(0, 10);

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

          return { ...agent, tasks_today: counts };
        }),
      );

      res.json({ data: enriched });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/agents/:slug/pause – orchestrator, admin
  router.post("/:slug/pause", requireRole("orchestrator", "admin"), async (req, res) => {
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
        user_id: req.user!.id,
        action: "agent_paused",
        details_json: { slug },
      });

      // Audit trail
      await supabase.from("commands").insert({
        command_type: "pause_agent",
        target_slug: slug,
        payload_json: { slug, source: "api" },
        issued_by: req.user!.id,
        status: "completed",
        processed_at: new Date().toISOString(),
      });

      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/agents/:slug/resume – orchestrator, admin
  router.post("/:slug/resume", requireRole("orchestrator", "admin"), async (req, res) => {
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
        user_id: req.user!.id,
        action: "agent_resumed",
        details_json: { slug },
      });

      // Audit trail
      await supabase.from("commands").insert({
        command_type: "resume_agent",
        target_slug: slug,
        payload_json: { slug, source: "api" },
        issued_by: req.user!.id,
        status: "completed",
        processed_at: new Date().toISOString(),
      });

      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // PATCH /api/agents/:slug/routing – admin only
  router.patch("/:slug/routing", requireRole("admin"), validateBody(routingSchema), async (req, res) => {
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
        user_id: req.user!.id,
        action: "routing_updated",
        details_json: { slug, routing },
      });

      res.json({ data: { slug, routing } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // PATCH /api/agents/:slug/tools – admin only
  router.patch("/:slug/tools", requireRole("admin"), validateBody(toolsSchema), async (req, res) => {
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
        user_id: req.user!.id,
        action: "tools_updated",
        details_json: { slug, tools },
      });

      res.json({ data: { slug, tools } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  return router;
}
