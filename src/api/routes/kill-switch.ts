import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { KillSwitch } from "../../utils/kill-switch";

export function killSwitchRoutes(killSwitch: KillSwitch): Router {
  const router = Router();

  // GET /api/kill-switch/status
  router.get("/status", (_req, res) => {
    res.json({ data: killSwitch.getStatus() });
  });

  // POST /api/kill-switch
  router.post("/", requireRole("orchestrator", "admin"), async (req, res) => {
    try {
      const { action } = req.body ?? {};

      if (action === "activate") {
        await killSwitch.activate("api", req.user!.id);
        res.json({ data: killSwitch.getStatus() });
      } else if (action === "deactivate") {
        await killSwitch.deactivate("api", req.user!.id);
        res.json({ data: killSwitch.getStatus() });
      } else {
        res.status(400).json({ error: { code: "VALIDATION", message: "action must be 'activate' or 'deactivate'." } });
      }
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  return router;
}
