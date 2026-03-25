/**
 * Drive Setup Service — skapar FIA:s mappstruktur på Google Drive.
 *
 * Använder handleGwsToolUse() från gws.ts (MCP-paket / CLI fallback).
 * Sparar folder-IDs i Supabase system_settings och genererar
 * agent-kontext-filer (drive-folders.md) per agent.
 */

import fs from "fs";
import path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { handleGwsToolUse } from "./gws";
import { DRIVE_FOLDER_TREE, AGENT_DRIVE_FOLDERS, flattenTree, DriveFolderNode } from "./drive-structure";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FolderMapEntry {
  path: string;
  folderId: string;
  name: string;
}

export interface DriveSetupResult {
  created: FolderMapEntry[];
  existing: FolderMapEntry[];
  errors: Array<{ path: string; error: string }>;
  folderMap: Record<string, string>; // path → folderId
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check that GWS Drive auth is working by listing files.
 * Throws if auth is not configured.
 */
export async function checkDriveAuth(config: AppConfig): Promise<void> {
  try {
    await handleGwsToolUse({ toolName: "drive_list_files", input: { max_results: 1 } }, config);
  } catch {
    throw new Error(
      "Google Workspace-autentisering saknas eller fungerar inte. " +
        "Konfigurera OAuth-credentials via scripts/gws-auth.mjs och sätt GWORKSPACE_CREDS_DIR i .env.",
    );
  }
}

/**
 * Create the full FIA folder tree on Drive. Idempotent — skips existing folders.
 */
export async function setupDriveFolders(
  config: AppConfig,
  supabase: SupabaseClient,
  dryRun: boolean,
): Promise<DriveSetupResult> {
  const result: DriveSetupResult = {
    created: [],
    existing: [],
    errors: [],
    folderMap: {},
  };

  // Load any previously saved folder map
  const savedMap = await loadFolderMap(supabase);

  // Walk the tree depth-first and create missing folders
  await walkAndCreate(DRIVE_FOLDER_TREE, "", savedMap, result, config, dryRun);

  if (!dryRun) {
    // Persist the full folder map to system_settings
    await saveFolderMap(supabase, result.folderMap);

    // Generate per-agent context files
    generateContextFiles(result.folderMap);
  }

  return result;
}

/**
 * Load the saved folder map from Supabase.
 */
export async function loadFolderMap(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "drive_folder_map").maybeSingle();

  if (data?.value && typeof data.value === "object") {
    return data.value as Record<string, string>;
  }
  return {};
}

/**
 * Get the all expected folder paths from the tree.
 */
export function getAllFolderPaths(): string[] {
  return flattenTree(DRIVE_FOLDER_TREE);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function walkAndCreate(
  node: DriveFolderNode,
  parentPath: string,
  savedMap: Record<string, string>,
  result: DriveSetupResult,
  config: AppConfig,
  dryRun: boolean,
): Promise<void> {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const parentId = parentPath ? result.folderMap[parentPath] : undefined;

  // Check if we already have this folder
  if (savedMap[currentPath]) {
    const folderId = savedMap[currentPath];

    // Verify it still exists on Drive
    const exists = await verifyFolder(folderId, config);
    if (exists) {
      result.existing.push({ path: currentPath, folderId, name: node.name });
      result.folderMap[currentPath] = folderId;

      // Continue to children
      if (node.children) {
        for (const child of node.children) {
          await walkAndCreate(child, currentPath, savedMap, result, config, dryRun);
        }
      }
      return;
    }
    // Folder was deleted on Drive — recreate below
  }

  if (dryRun) {
    // In dry-run mode, use a placeholder ID so children can reference it
    result.created.push({ path: currentPath, folderId: "(dry-run)", name: node.name });
    result.folderMap[currentPath] = "(dry-run)";
  } else {
    // Create the folder on Drive
    try {
      const folderId = await createDriveFolder(node.name, parentId, config);
      result.created.push({ path: currentPath, folderId, name: node.name });
      result.folderMap[currentPath] = folderId;
    } catch (err) {
      result.errors.push({ path: currentPath, error: (err as Error).message });
      return; // Skip children if parent creation failed
    }
  }

  // Process children
  if (node.children) {
    for (const child of node.children) {
      await walkAndCreate(child, currentPath, savedMap, result, config, dryRun);
    }
  }
}

async function createDriveFolder(name: string, parentId: string | undefined, config: AppConfig): Promise<string> {
  const input: Record<string, unknown> = { name };
  if (parentId) {
    input.parent_id = parentId;
  }

  const raw = await handleGwsToolUse({ toolName: "drive_create_folder", input }, config);
  const parsed = JSON.parse(raw);

  // The MCP tool typically returns { id: "...", name: "..." } or similar
  const folderId = parsed.id ?? parsed.folderId ?? parsed.folder_id;
  if (!folderId) {
    throw new Error(`drive_create_folder returned no folder ID: ${raw}`);
  }
  return String(folderId);
}

async function verifyFolder(folderId: string, config: AppConfig): Promise<boolean> {
  try {
    await handleGwsToolUse({ toolName: "drive_get_metadata", input: { file_id: folderId } }, config);
    return true;
  } catch {
    return false;
  }
}

async function saveFolderMap(supabase: SupabaseClient, folderMap: Record<string, string>): Promise<void> {
  const { error } = await supabase.from("system_settings").upsert(
    {
      key: "drive_folder_map",
      value: folderMap,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    throw new Error(`Kunde inte spara folder map: ${error.message}`);
  }
}

function generateContextFiles(folderMap: Record<string, string>): void {
  const knowledgeBase = path.resolve(process.cwd(), "knowledge", "agents");

  for (const [agentSlug, folderPaths] of Object.entries(AGENT_DRIVE_FOLDERS)) {
    const contextDir = path.join(knowledgeBase, agentSlug, "context");

    // Only generate if the agent directory exists
    if (!fs.existsSync(contextDir)) continue;

    const rows = folderPaths.filter((p) => folderMap[p]).map((p) => `| ${p} | \`${folderMap[p]}\` |`);

    if (rows.length === 0) continue;

    const content = [
      "<!-- Auto-generated by fia drive setup — redigera inte manuellt -->",
      "# Google Drive-mappar",
      "",
      "Använd dessa folder-IDs som `parent_id` vid `drive_create_file` och `drive_create_folder`.",
      "",
      "| Mapp | Folder ID |",
      "|------|-----------|",
      ...rows,
      "",
    ].join("\n");

    fs.writeFileSync(path.join(contextDir, "drive-folders.md"), content, "utf-8");
  }
}
