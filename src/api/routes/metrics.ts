import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";

export function metricRoutes(supabase: SupabaseClient): Router {
  const router = Router();

  // GET /api/metrics
  router.get("/", async (req, res) => {
    try {
      const { category, period, from, to } = req.query as Record<string, string>;

      let query = supabase.from("metrics").select("*").order("period_start", { ascending: false });

      if (category) query = query.eq("category", category);
      if (period) query = query.eq("period", period);
      if (from) query = query.gte("period_start", from);
      if (to) query = query.lte("period_start", to);

      const { data, error } = await query.limit(200);
      if (error) throw error;

      res.json({ data: data ?? [] });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // GET /api/metrics/summary
  router.get("/summary", async (req, res) => {
    try {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const weekStr = weekStart.toISOString().slice(0, 10);
      const monthStr = monthStart.toISOString().slice(0, 10);

      // Content this week
      const { count: contentThisWeek } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("type", "blog_post")
        .in("status", ["approved", "published"])
        .gte("created_at", `${weekStr}T00:00:00Z`);

      // Pending approvals
      const { count: pendingApprovals } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("status", "awaiting_review");

      // Approval rate (last 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
      const { data: recentApprovals } = await supabase
        .from("approvals")
        .select("decision")
        .gte("created_at", thirtyDaysAgo);

      const total = recentApprovals?.length ?? 0;
      const approved = recentApprovals?.filter((a) => a.decision === "approved").length ?? 0;
      const approvalRate = total > 0 ? approved / total : 0;

      // Cost MTD
      const { data: costData } = await supabase
        .from("tasks")
        .select("cost_sek")
        .gte("created_at", `${monthStr}T00:00:00Z`)
        .not("cost_sek", "is", null);

      const costMtd = (costData ?? []).reduce((sum, t) => sum + (t.cost_sek ?? 0), 0);

      res.json({
        data: {
          content_this_week: contentThisWeek ?? 0,
          approval_rate: Math.round(approvalRate * 100) / 100,
          pending_approvals: pendingApprovals ?? 0,
          cost_mtd_sek: Math.round(costMtd * 100) / 100,
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  return router;
}
