import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole, getDbUserId } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logActivity } from "../../supabase/activity-writer";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { checkDriveAuth, setupDriveFolders, loadFolderMap, getAllFolderPaths } from "../../mcp/drive-setup";

const setupSchema = z.object({
  dry_run: z.boolean().optional().default(false),
});

export function driveRoutes(supabase: SupabaseClient, config: AppConfig, logger: Logger): Router {
  const router = Router();

  // GET /api/drive/status — visa aktuell mappstruktur
  router.get("/status", async (_req, res) => {
    try {
      const folderMap = await loadFolderMap(supabase);
      const allPaths = getAllFolderPaths();
      const configured = Object.keys(folderMap).length;

      res.json({
        data: {
          configured: configured > 0,
          folder_count: configured,
          expected_count: allPaths.length,
          folder_map: folderMap,
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // POST /api/drive/setup — skapa mappar (admin only)
  router.post("/setup", requireRole("admin"), validateBody(setupSchema), async (req, res) => {
    const dryRun = req.body.dry_run === true;

    try {
      // Verify Drive auth first
      await checkDriveAuth(config);

      logger.info("Drive setup initiated", {
        action: "drive_setup_start",
        dry_run: dryRun,
        user: req.user?.id,
      });

      const result = await setupDriveFolders(config, supabase, dryRun);

      if (!dryRun) {
        await logActivity(supabase, {
          user_id: getDbUserId(req),
          action: "drive_setup",
          details_json: {
            created: result.created.length,
            existing: result.existing.length,
            errors: result.errors.length,
          },
        });
      }

      logger.info("Drive setup completed", {
        action: "drive_setup_complete",
        dry_run: dryRun,
        created: result.created.length,
        existing: result.existing.length,
        errors: result.errors.length,
      });

      res.json({ data: { dry_run: dryRun, ...result } });
    } catch (err) {
      logger.error("Drive setup failed", {
        action: "drive_setup_error",
        error: (err as Error).message,
      });
      res.status(500).json({ error: { code: "DRIVE_SETUP_FAILED", message: (err as Error).message } });
    }
  });

  return router;
}
