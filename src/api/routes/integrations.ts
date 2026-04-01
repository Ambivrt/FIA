import { Router } from "express";
import { AppConfig } from "../../utils/config";
import { checkIntegrationHealth } from "../../mcp/integration-status";

export function integrationRoutes(config: AppConfig): Router {
  const router = Router();

  // GET /api/integrations/status
  router.get("/status", async (_req, res) => {
    try {
      const health = await checkIntegrationHealth(config);
      res.json({ data: health });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTEGRATION_CHECK_FAILED", message: (err as Error).message },
      });
    }
  });

  return router;
}
