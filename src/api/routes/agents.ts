import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "../middleware/auth";
import { logActivity } from "../../supabase/activity-writer";

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

  return router;
}
