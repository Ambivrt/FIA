import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission, getDbUserId } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logActivity } from "../../supabase/activity-writer";
import { knowledgeReseedSchema } from "../schemas/knowledge";
import { seedAllKnowledge, seedAgentKnowledge } from "../../knowledge/knowledge-seeder";
import { AppConfig } from "../../utils/config";

export function knowledgeRoutes(supabase: SupabaseClient, config: AppConfig): Router {
  const router = Router();

  // POST /api/knowledge/reseed – admin only
  router.post(
    "/reseed",
    requirePermission("knowledge_reseed"),
    validateBody(knowledgeReseedSchema),
    async (req, res) => {
      try {
        const confirm = req.body?.confirm === true;
        const agentSlug = req.body?.agent_slug as string | undefined;

        if (agentSlug) {
          // Single agent
          const diff = await seedAgentKnowledge(supabase, config, agentSlug, !confirm);

          if (!confirm) {
            res.json({ dry_run: true, agents: [diff] });
            return;
          }

          await logActivity(supabase, {
            user_id: getDbUserId(req),
            action: "knowledge_reseeded",
            details_json: { scope: "single", agent_slug: agentSlug, added: diff.added },
          });

          res.json({ dry_run: false, agents: [diff], message: `${agentSlug} knowledge reseeded.` });
        } else {
          // All agents
          const diffs = await seedAllKnowledge(supabase, config, !confirm);

          if (!confirm) {
            res.json({ dry_run: true, agents: diffs });
            return;
          }

          const totalAdded = diffs.reduce((s, d) => s + d.added, 0);

          await logActivity(supabase, {
            user_id: getDbUserId(req),
            action: "knowledge_reseeded",
            details_json: {
              scope: "all",
              agents: diffs.map((d) => d.slug),
              total_items: totalAdded,
            },
          });

          res.json({
            dry_run: false,
            agents: diffs,
            message: `${diffs.length} agenter, ${totalAdded} knowledge items seeded.`,
          });
        }
      } catch (err) {
        res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
      }
    },
  );

  return router;
}
