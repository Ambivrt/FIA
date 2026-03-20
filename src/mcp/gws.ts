/**
 * GWS (Google Workspace) wrapper — tunn integration mot Google Workspace API:er.
 *
 * Primär: Importerar verktyg direkt från @alanse/mcp-server-google-workspace.
 * Fallback: Exec:ar gws CLI (@googleworkspace/cli) via child_process om installerat.
 *
 * Agent-manifesten refererar till "gws:drive", "gws:docs", "gws:sheets", "gws:analytics".
 * Denna modul mappar dessa referenser till konkreta verktyg och handlers.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { ToolDefinition, ToolUseResult } from "../llm/types";
import { AppConfig } from "../utils/config";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Tool registry from @alanse/mcp-server-google-workspace
// ---------------------------------------------------------------------------

interface GwsTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

let _cachedTools: GwsTool[] | null = null;

async function loadMcpTools(): Promise<GwsTool[]> {
  if (_cachedTools) return _cachedTools;
  try {
    const mod = await import("@alanse/mcp-server-google-workspace/dist/tools/index.js");
    _cachedTools = (mod.tools ?? []) as GwsTool[];
    return _cachedTools;
  } catch {
    _cachedTools = [];
    return [];
  }
}

// ---------------------------------------------------------------------------
// Service → tool-name prefix mapping
// ---------------------------------------------------------------------------

/** Maps agent.yaml "gws:<service>" → tool name prefixes in the MCP package. */
const SERVICE_PREFIX_MAP: Record<string, string[]> = {
  "gws:drive": ["drive_"],
  "gws:docs": ["gdocs_"],
  "gws:sheets": ["gsheets_"],
  "gws:gmail": ["gmail_"],
  "gws:calendar": ["calendar_"],
  // gws:analytics uses GA4 — not yet in @alanse package.
  // Falls back to gws CLI or is a no-op until GA4 support lands.
  "gws:analytics": [],
};

/**
 * Curated subset of tools per service — only the tools our agents actually need.
 * Keeps the tool list small (LLM token-efficient) instead of exposing all 130+ tools.
 */
const CURATED_TOOLS: Record<string, string[]> = {
  "gws:drive": [
    "drive_list_files",
    "drive_search",
    "drive_read_file",
    "drive_get_metadata",
    "drive_create_file",
    "drive_upload_file",
    "drive_create_folder",
    "drive_list_folder_contents",
  ],
  "gws:docs": [
    "gdocs_create",
    "gdocs_read",
    "gdocs_get_metadata",
    "gdocs_list_documents",
    "gdocs_insert_text",
    "gdocs_update_text",
    "gdocs_append_text",
    "gdocs_replace_text",
    "gdocs_export",
  ],
  "gws:sheets": [
    "gsheets_read",
    "gsheets_list_sheets",
    "gsheets_create_spreadsheet",
    "gsheets_update_cell",
    "gsheets_append_data",
    "gsheets_batch_update",
  ],
  "gws:gmail": [
    "gmail_search_messages",
    "gmail_get_message",
    "gmail_send_message",
    "gmail_draft_message",
  ],
  "gws:calendar": [
    "calendar_list_events",
    "calendar_get_event",
    "calendar_create_event",
    "calendar_update_event",
    "calendar_delete_event",
  ],
  "gws:analytics": [],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build Claude ToolDefinition[] for the GWS tools an agent needs.
 * Reads the agent's `tools` field and returns only matching GWS tool definitions.
 */
export async function buildGwsToolDefinitions(agentTools: string[]): Promise<ToolDefinition[]> {
  const gwsServices = agentTools.filter((t) => t.startsWith("gws:"));
  if (gwsServices.length === 0) return [];

  const allTools = await loadMcpTools();
  const definitions: ToolDefinition[] = [];

  for (const service of gwsServices) {
    const curatedNames = CURATED_TOOLS[service];
    if (!curatedNames || curatedNames.length === 0) continue;

    for (const toolName of curatedNames) {
      const tool = allTools.find((t) => t.name === toolName);
      if (!tool) continue;

      definitions.push({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Record<string, unknown>,
      });
    }
  }

  return definitions;
}

/**
 * Execute a GWS tool_use call from the LLM.
 * Tries the MCP package handler first, falls back to gws CLI.
 */
export async function handleGwsToolUse(
  toolUse: ToolUseResult,
  config: AppConfig,
): Promise<string> {
  // Try MCP package handler first
  const allTools = await loadMcpTools();
  const tool = allTools.find((t) => t.name === toolUse.toolName);

  if (tool) {
    try {
      const result = await tool.handler(toolUse.input);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    } catch (err) {
      const message = (err as Error).message;
      // If MCP handler fails, try CLI fallback
      const cliResult = await tryGwsCli(toolUse, config);
      if (cliResult !== null) return cliResult;
      throw new Error(`GWS tool "${toolUse.toolName}" failed: ${message}`);
    }
  }

  // No MCP handler — try CLI
  const cliResult = await tryGwsCli(toolUse, config);
  if (cliResult !== null) return cliResult;

  throw new Error(`GWS tool "${toolUse.toolName}" not found in MCP package or CLI`);
}

/**
 * Check if a tool name belongs to GWS.
 */
export function isGwsTool(toolName: string): boolean {
  const prefixes = Object.values(SERVICE_PREFIX_MAP).flat();
  return prefixes.some((prefix) => toolName.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// GWS CLI fallback
// ---------------------------------------------------------------------------

/**
 * Attempt to execute a tool via gws CLI.
 * Maps tool names like "drive_list_files" → "gws drive files list --format json".
 * Returns null if CLI is not available.
 */
async function tryGwsCli(
  toolUse: ToolUseResult,
  config: AppConfig,
): Promise<string | null> {
  const gwsBin = resolveGwsBin();
  if (!gwsBin) return null;

  const cliArgs = toolNameToCliArgs(toolUse.toolName, toolUse.input);
  if (!cliArgs) return null;

  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (config.gwsCredentialsFile) {
    env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = config.gwsCredentialsFile;
  }

  try {
    const { stdout } = await execFileAsync(gwsBin, [...cliArgs, "--format", "json"], {
      env,
      timeout: 30_000,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Resolve gws binary path — local node_modules or global. */
function resolveGwsBin(): string | null {
  try {
    const localBin = path.join(process.cwd(), "node_modules", ".bin", "gws");
    return localBin;
  } catch {
    return null;
  }
}

/**
 * Map MCP tool names to gws CLI arguments.
 * "drive_list_files" → ["drive", "files", "list"]
 * "gdocs_create" → ["docs", "documents", "create"]
 */
function toolNameToCliArgs(
  toolName: string,
  input: Record<string, unknown>,
): string[] | null {
  const CLI_MAP: Record<string, string[]> = {
    drive_list_files: ["drive", "files", "list"],
    drive_search: ["drive", "files", "list"],
    drive_read_file: ["drive", "files", "get"],
    drive_get_metadata: ["drive", "files", "get"],
    drive_create_file: ["drive", "files", "create"],
    drive_upload_file: ["drive", "files", "create"],
    drive_create_folder: ["drive", "files", "create"],
    drive_list_folder_contents: ["drive", "files", "list"],
    gdocs_create: ["docs", "documents", "create"],
    gdocs_read: ["docs", "documents", "get"],
    gdocs_list_documents: ["drive", "files", "list"],
    gsheets_read: ["sheets", "spreadsheets", "values", "get"],
    gsheets_create_spreadsheet: ["sheets", "spreadsheets", "create"],
    gsheets_update_cell: ["sheets", "spreadsheets", "values", "update"],
    gsheets_append_data: ["sheets", "spreadsheets", "values", "append"],
  };

  const baseArgs = CLI_MAP[toolName];
  if (!baseArgs) return null;

  // Append input parameters as CLI flags
  const flags: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "") {
      flags.push(`--${camelToKebab(key)}`, String(value));
    }
  }

  return [...baseArgs, ...flags];
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
