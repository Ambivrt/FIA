import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { KillSwitch } from "../../utils/kill-switch";

const killSwitchSchema = z.object({
  action: z.enum(["activate", "deactivate"], {
    error: "action must be 'activate' or 'deactivate'.",
  }),
});

export function killSwitchRoutes(killSwitch: KillSwitch, supabase: SupabaseClient): Router {
  const router = Router();

  // GET /api/kill-switch/status
  router.get("/status", (_req, res) => {
    res.json({ data: killSwitch.getStatus() });
  });

  // POST /api/kill-switch
  router.post("/", requireRole("orchestrator", "admin"), validateBody(killSwitchSchema), async (req, res) => {
    try {
      const { action } = req.body;

      if (action === "activate") {
        await killSwitch.activate("api", req.user!.id);
      } else {
        await killSwitch.deactivate("api", req.user!.id);
      }

      // Audit trail
      await supabase.from("commands").insert({
        command_type: "kill_switch",
        payload_json: { active: action === "activate", source: "api" },
        issued_by: req.user!.id,
        status: "completed",
        processed_at: new Date().toISOString(),
      });

      res.json({ data: killSwitch.getStatus() });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  return router;
}
