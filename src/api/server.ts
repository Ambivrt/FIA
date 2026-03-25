import express from "express";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { KillSwitch } from "../utils/kill-switch";
import { requireAuth } from "./middleware/auth";
import { dnsRebindingProtection } from "./middleware/dns-rebinding";
import { openApiSpec } from "./openapi";
import { agentRoutes } from "./routes/agents";
import { taskRoutes } from "./routes/tasks";
import { metricRoutes } from "./routes/metrics";
import { activityRoutes } from "./routes/activity";
import { killSwitchRoutes } from "./routes/kill-switch";
import { triggerRoutes } from "./routes/triggers";
import { knowledgeRoutes } from "./routes/knowledge";
import { driveRoutes } from "./routes/drive";

export function createApiServer(
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient,
  killSwitch: KillSwitch,
): express.Express {
  const app = express();

  app.use(express.json());

  // DNS rebinding protection — validate Host header
  const port = config.gatewayApiPort;
  const host = config.gatewayApiHost;
  app.use(
    dnsRebindingProtection({
      allowedHosts: [`${host}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`],
    }),
  );

  // Assign correlation ID to every request
  app.use((req, _res, next) => {
    req.correlationId = (req.headers["x-correlation-id"] as string) ?? uuidv4();
    next();
  });

  // Health check (no auth, no rate limit)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // OpenAPI spec (no auth, no rate limit)
  app.get("/api/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  // Rate limiting on all /api routes
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMIT", message: "Too many requests. Try again later." } },
    }),
  );

  // All other routes require auth
  app.use("/api", requireAuth(supabase));

  app.use("/api/agents", agentRoutes(supabase, killSwitch, config));
  app.use("/api/tasks", taskRoutes(supabase));
  app.use("/api/metrics", metricRoutes(supabase));
  app.use("/api/activity", activityRoutes(supabase));
  app.use("/api/kill-switch", killSwitchRoutes(killSwitch, supabase));
  app.use("/api/triggers", triggerRoutes(supabase, config));
  app.use("/api/knowledge", knowledgeRoutes(supabase, config));
  app.use("/api/drive", driveRoutes(supabase, config, logger));

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Unhandled API error", { action: "api_error", error: err.message });
    res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error." } });
  });

  return app;
}

export function startApiServer(app: express.Express, port: number, host: string, logger: Logger): void {
  app.listen(port, host, () => {
    logger.info(`API server listening on ${host}:${port}`, { action: "api_start" });
  });
}
