import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole, getDbUserId } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logActivity } from "../../supabase/activity-writer";
import { createTask } from "../../supabase/task-writer";

const rejectSchema = z.object({
  reason: z.string().min(1, "Reason is required."),
});

export function triggerRoutes(supabase: SupabaseClient): Router {
  const router = Router();

  // GET /api/triggers/pending
  router.get(
    "/pending",
    requireRole("orchestrator", "admin"),
    async (_req, res) => {
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
    },
  );

  // POST /api/triggers/:id/approve
  router.post(
    "/:id/approve",
    requireRole("orchestrator", "admin"),
    async (req, res) => {
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
          res.status(400).json({ error: { code: "BAD_REQUEST", message: `Target agent '${trigger.target_agent_slug}' not found.` } });
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
    },
  );

  // POST /api/triggers/:id/reject
  router.post(
    "/:id/reject",
    requireRole("orchestrator", "admin"),
    validateBody(rejectSchema),
    async (req, res) => {
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
    },
  );

  return router;
}
