import { Router } from "express";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requirePermission, getDbUserId } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logActivity } from "../../supabase/activity-writer";
import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { checkDriveAuth, setupDriveFolders, loadFolderMap, getAllFolderPaths } from "../../mcp/drive-setup";
import { DRIVE_FOLDER_TREE, AGENT_DRIVE_FOLDERS } from "../../mcp/drive-structure";
import { handleGwsToolUse } from "../../mcp/gws";

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

  // GET /api/drive/tree — trädstruktur med status
  router.get("/tree", requirePermission("view_knowledge"), async (_req, res) => {
    try {
      const folderMap = await loadFolderMap(supabase);

      res.json({
        data: {
          tree: DRIVE_FOLDER_TREE,
          agent_folders: AGENT_DRIVE_FOLDERS,
          folder_map: folderMap,
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: "INTERNAL", message: (err as Error).message } });
    }
  });

  // GET /api/drive/folders/:folderId/contents — lista filer i en mapp
  router.get("/folders/:folderId/contents", requirePermission("view_knowledge"), async (req, res) => {
    const { folderId } = req.params;
    const maxResults = Math.min(parseInt(req.query.max_results as string) || 50, 200);

    try {
      const raw = await handleGwsToolUse(
        {
          toolName: "drive_list_folder_contents",
          input: { folderId, pageSize: maxResults },
        },
        config,
      );

      let files: unknown[] = [];
      try {
        const parsed = JSON.parse(raw);
        // Handle MCP response format: { content: [{ text: "..." }] }
        if (parsed.content && Array.isArray(parsed.content)) {
          const text = parsed.content.map((c: { text?: string }) => c.text ?? "").join("");
          let inner: Record<string, unknown> | unknown[];
          try {
            inner = JSON.parse(text);
          } catch {
            // ResponseFormatter prepends human-readable text before JSON
            const idx = text.lastIndexOf("\n\n{");
            inner = idx !== -1 ? JSON.parse(text.slice(idx + 2)) : {};
          }
          files = Array.isArray(inner) ? inner : (((inner as Record<string, unknown>).files as unknown[]) ?? []);
        } else if (Array.isArray(parsed)) {
          files = parsed;
        } else if (parsed.files && Array.isArray(parsed.files)) {
          files = parsed.files;
        }
      } catch {
        // raw might be plain text listing — return empty
        logger.warn("Could not parse drive_list_folder_contents response", {
          action: "drive_list_parse_error",
          folder_id: folderId,
        });
      }

      res.json({ data: files });
    } catch (err) {
      res.status(500).json({ error: { code: "DRIVE_LIST_FAILED", message: (err as Error).message } });
    }
  });

  // GET /api/drive/files/:fileId/metadata — filmetadata
  router.get("/files/:fileId/metadata", requirePermission("view_knowledge"), async (req, res) => {
    const { fileId } = req.params;

    try {
      const raw = await handleGwsToolUse(
        {
          toolName: "drive_get_metadata",
          input: { fileId },
        },
        config,
      );

      let metadata: unknown = {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed.content && Array.isArray(parsed.content)) {
          const text = parsed.content.map((c: { text?: string }) => c.text ?? "").join("");
          try {
            metadata = JSON.parse(text);
          } catch {
            // ResponseFormatter prepends human-readable text before JSON
            const idx = text.lastIndexOf("\n\n{");
            metadata = idx !== -1 ? JSON.parse(text.slice(idx + 2)) : {};
          }
        } else {
          metadata = parsed;
        }
      } catch {
        logger.warn("Could not parse drive_get_metadata response", {
          action: "drive_metadata_parse_error",
          file_id: fileId,
        });
      }

      res.json({ data: metadata });
    } catch (err) {
      res.status(500).json({ error: { code: "DRIVE_METADATA_FAILED", message: (err as Error).message } });
    }
  });

  // POST /api/drive/setup — skapa mappar (admin only)
  router.post("/setup", requirePermission("drive_setup"), validateBody(setupSchema), async (req, res) => {
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
