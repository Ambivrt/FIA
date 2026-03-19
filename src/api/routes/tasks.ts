import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { updateTaskStatus, createApproval } from "../../supabase/task-writer";
import { logActivity } from "../../supabase/activity-writer";

const approveSchema = z.object({
  feedback: z.string().optional(),
});

const rejectSchema = z.object({
  feedback: z.string().min(1, "Feedback is required for rejection."),
});

const revisionSchema = z.object({
  feedback: z.string().min(1, "Feedback is required for revision request."),
});

const ALLOWED_SORT_FIELDS = ["created_at", "updated_at", "priority", "status", "type"] as const;

export function taskRoutes(supabase: SupabaseClient): Router {
  const router = Router();

  // GET /api/tasks
  router.get("/", async (req, res) => {
    try {
      const {
        status,
        agent_slug,
        type,
        priority,
        page = "1",
        per_page = "50",
        sort = "-created_at",
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10));
      const perPage = Math.min(100, Math.max(1, parseInt(per_page, 10)));
      const offset = (pageNum - 1) * perPage;

      const rawField = sort.startsWith("-") ? sort.slice(1) : sort;
      const sortField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(rawField) ? rawField : "created_at";
      const ascending = !sort.startsWith("-");

      let query = supabase.from("tasks").select("*, agents!inner(slug, name)", { count: "exact" });

      if (status) query = query.eq("status", status);
      if (agent_slug) query = query.eq("agents.slug", agent_slug);
      if (type) query = query.eq("type", type);
      if (priority) query = query.eq("priority", priority);

      query = query.order(sortField, { ascending }).range(offset, offset + perPage - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      res.json({ data: data ?? [], meta: { total: count ?? 0, page: pageNum, per_page: perPage } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // GET /api/tasks/:id
  router.get("/:id", async (req, res) => {
    try {
      const { data: task, error } = await supabase
        .from("tasks")
        .select("*, agents(slug, name)")
        .eq("id", req.params.id)
        .single();

      if (error || !task) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Task not found." } });
        return;
      }

      const { data: approvals } = await supabase
        .from("approvals")
        .select("*")
        .eq("task_id", req.params.id)
        .order("created_at", { ascending: false });

      res.json({ data: { ...task, approvals: approvals ?? [] } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/tasks/:id/approve
  router.post("/:id/approve", requireRole("orchestrator", "admin"), validateBody(approveSchema), async (req, res) => {
    try {
      const taskId = req.params.id as string;
      const { feedback } = req.body;
      await updateTaskStatus(supabase, taskId, "approved");
      await createApproval(supabase, {
        task_id: taskId,
        reviewer_type: "orchestrator",
        reviewer_id: req.user!.id,
        decision: "approved",
        feedback,
      });
      await logActivity(supabase, {
        user_id: req.user!.id,
        action: "task_approved",
        details_json: { task_id: taskId },
      });

      await supabase.from("commands").insert({
        command_type: "approve_task",
        payload_json: { task_id: taskId, feedback, source: "api" },
        issued_by: req.user!.id,
        status: "completed",
        processed_at: new Date().toISOString(),
      });

      res.json({ data: { id: taskId, status: "approved" } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/tasks/:id/reject
  router.post("/:id/reject", requireRole("orchestrator", "admin"), validateBody(rejectSchema), async (req, res) => {
    try {
      const taskId = req.params.id as string;
      const { feedback } = req.body;

      await updateTaskStatus(supabase, taskId, "rejected");
      await createApproval(supabase, {
        task_id: taskId,
        reviewer_type: "orchestrator",
        reviewer_id: req.user!.id,
        decision: "rejected",
        feedback,
      });
      await logActivity(supabase, {
        user_id: req.user!.id,
        action: "task_rejected",
        details_json: { task_id: taskId, feedback },
      });

      await supabase.from("commands").insert({
        command_type: "reject_task",
        payload_json: { task_id: taskId, feedback, source: "api" },
        issued_by: req.user!.id,
        status: "completed",
        processed_at: new Date().toISOString(),
      });

      res.json({ data: { id: taskId, status: "rejected" } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/tasks/:id/revision
  router.post("/:id/revision", requireRole("orchestrator", "admin"), validateBody(revisionSchema), async (req, res) => {
    try {
      const taskId = req.params.id as string;
      const { feedback } = req.body;

      await updateTaskStatus(supabase, taskId, "awaiting_review");
      await createApproval(supabase, {
        task_id: taskId,
        reviewer_type: "orchestrator",
        reviewer_id: req.user!.id,
        decision: "revision_requested",
        feedback,
      });
      await logActivity(supabase, {
        user_id: req.user!.id,
        action: "task_revision_requested",
        details_json: { task_id: taskId, feedback },
      });

      await supabase.from("commands").insert({
        command_type: "revision_task",
        payload_json: { task_id: taskId, feedback, source: "api" },
        issued_by: req.user!.id,
        status: "completed",
        processed_at: new Date().toISOString(),
      });

      res.json({ data: { id: taskId, status: "awaiting_review" } });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  return router;
}
