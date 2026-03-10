import express from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { requireAuth } from "./middleware/auth";
import { agentRoutes } from "./routes/agents";
import { taskRoutes } from "./routes/tasks";
import { metricRoutes } from "./routes/metrics";
import { activityRoutes } from "./routes/activity";
import { killSwitchRoutes } from "./routes/kill-switch";

export function createApiServer(
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient,
  killSwitch: KillSwitch
): express.Express {
  const app = express();

  app.use(express.json());

  // Health check (no auth)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // All other routes require auth
  app.use("/api", requireAuth(supabase));

  app.use("/api/agents", agentRoutes(supabase));
  app.use("/api/tasks", taskRoutes(supabase));
  app.use("/api/metrics", metricRoutes(supabase));
  app.use("/api/activity", activityRoutes(supabase));
  app.use("/api/kill-switch", killSwitchRoutes(killSwitch));

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Unhandled API error", { action: "api_error", error: err.message });
    res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error." } });
  });

  return app;
}

export function startApiServer(app: express.Express, port: number, logger: Logger): void {
  app.listen(port, () => {
    logger.info(`API server listening on port ${port}`, { action: "api_start" });
  });
}
