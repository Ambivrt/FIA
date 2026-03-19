import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";

export function activityRoutes(supabase: SupabaseClient): Router {
  const router = Router();

  // GET /api/activity
  router.get("/", async (req, res) => {
    try {
      const { agent_slug, action, from, to, search, page = "1", per_page = "50" } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10));
      const perPage = Math.min(100, Math.max(1, parseInt(per_page, 10)));
      const offset = (pageNum - 1) * perPage;

      let query = supabase
        .from("activity_log")
        .select("*, agents(slug, name)", { count: "exact" })
        .order("created_at", { ascending: false });

      if (agent_slug) {
        const { data: agent } = await supabase.from("agents").select("id").eq("slug", agent_slug).single();
        if (agent) query = query.eq("agent_id", agent.id);
      }
      if (action) query = query.eq("action", action);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (search) query = query.ilike("action", `%${search}%`);

      query = query.range(offset, offset + perPage - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      res.json({ data: data ?? [], meta: { total: count ?? 0, page: pageNum, per_page: perPage } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  return router;
}
