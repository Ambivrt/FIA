import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { KillSwitch } from "../../utils/kill-switch";

const killSwitchSchema = z.object({
  action: z.enum(["activate", "deactivate"], {
    error: "action must be 'activate' or 'deactivate'.",
  }),
});

export function killSwitchRoutes(killSwitch: KillSwitch): Router {
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

      res.json({ data: killSwitch.getStatus() });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  return router;
}
