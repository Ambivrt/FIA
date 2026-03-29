/**
 * GWS (Google Workspace) wrapper — tunn integration mot Google Workspace API:er.
 *
 * Primär: Importerar verktyg direkt från @alanse/mcp-server-google-workspace.
 * Fallback: Exec:ar gws CLI (@googleworkspace/cli) via child_process om installerat.
 *
 * Agent-manifesten refererar till "gws:drive", "gws:docs", "gws:sheets", "gws:analytics".
 * Denna modul mappar dessa referenser till konkreta verktyg och handlers.
 */

import { execFile, execSync } from "child_process";
import { existsSync } from "fs";
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
let _authInitialized = false;

/**
 * Ensure the googleapis global auth is set before calling any tool.
 * The MCP package's loadCredentialsQuietly() creates an OAuth2 client but
 * does NOT call google.options({ auth }), so tools like google.drive("v3")
 * run unauthenticated. We fix that here.
 */
async function ensureGlobalAuth(): Promise<void> {
  if (_authInitialized) return;
  try {
    const { google } = await import("googleapis");
    // @ts-expect-error — no type declarations for MCP package internals
    const authMod = await import("@alanse/mcp-server-google-workspace/dist/auth.js");
    const authClient = await authMod.loadCredentialsQuietly();
    if (authClient) {
      google.options({ auth: authClient });
      authMod.setupTokenRefresh();
      _authInitialized = true;
    }
  } catch {
    // Auth not available — tools will fail with descriptive errors
  }
}

async function loadMcpTools(): Promise<GwsTool[]> {
  if (_cachedTools) return _cachedTools;
  try {
    await ensureGlobalAuth();
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
  "gws:gmail": ["gmail_search_messages", "gmail_get_message", "gmail_send_message", "gmail_draft_message"],
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
export async function handleGwsToolUse(toolUse: ToolUseResult, config: AppConfig): Promise<string> {
  // Try MCP package handler first
  const allTools = await loadMcpTools();
  const tool = allTools.find((t) => t.name === toolUse.toolName);

  if (tool) {
    try {
      const result = await tool.handler(toolUse.input);

      // MCP tools return { content: [...], isError: true } on failure without throwing
      if (result && typeof result === "object" && (result as Record<string, unknown>).isError) {
        const content = (result as Record<string, unknown>).content;
        const errorText =
          Array.isArray(content) && content.length > 0 && typeof content[0] === "object" && content[0].text
            ? String(content[0].text)
            : JSON.stringify(result);
        throw new Error(errorText);
      }

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
async function tryGwsCli(toolUse: ToolUseResult, config: AppConfig): Promise<string | null> {
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

/** Resolve gws binary path — local node_modules, then PATH. */
function resolveGwsBin(): string | null {
  // Try local node_modules first
  const localBin = path.join(process.cwd(), "node_modules", ".bin", "gws");
  if (existsSync(localBin)) return localBin;

  // Try PATH via which/where
  try {
    const globalBin = execSync(process.platform === "win32" ? "where gws" : "which gws", {
      encoding: "utf-8",
      timeout: 5_000,
    }).trim();
    if (globalBin) return globalBin.split("\n")[0];
  } catch {
    // gws not found in PATH
  }

  return null;
}

// ---------------------------------------------------------------------------
// CLI command mapping — maps all 32 curated tool names to gws CLI args
// ---------------------------------------------------------------------------

interface CliMapping {
  /** Base gws CLI subcommand args, e.g. ["drive", "files", "list"] */
  args: string[];
  /**
   * Optional input transformer — mutates the input before flag generation.
   * Can inject extra flags, rename fields, or build request bodies.
   * Returns extra flags to prepend before the auto-generated ones.
   */
  transformInput?: (input: Record<string, unknown>) => string[];
}

const CLI_MAP: Record<string, CliMapping> = {
  // --- Drive (8) ---
  drive_list_files: { args: ["drive", "files", "list"] },
  drive_search: {
    args: ["drive", "files", "list"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.query) {
        flags.push("--q", String(input.query));
        delete input.query;
      }
      return flags;
    },
  },
  drive_read_file: {
    args: ["drive", "files", "export"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.file_id) {
        flags.push("--file-id", String(input.file_id));
        delete input.file_id;
      }
      return flags;
    },
  },
  drive_get_metadata: {
    args: ["drive", "files", "get"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.file_id) {
        flags.push("--file-id", String(input.file_id));
        delete input.file_id;
      }
      return flags;
    },
  },
  drive_create_file: { args: ["drive", "files", "create"] },
  drive_upload_file: {
    args: ["drive", "files", "create"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.filePath) {
        flags.push("--upload", String(input.filePath));
        delete input.filePath;
      }
      return flags;
    },
  },
  drive_create_folder: {
    args: ["drive", "files", "create"],
    transformInput: () => {
      // Inject folder MIME type so Drive creates a folder, not a file
      return ["--mime-type", "application/vnd.google-apps.folder"];
    },
  },
  drive_list_folder_contents: {
    args: ["drive", "files", "list"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.folderId) {
        flags.push("--q", `'${String(input.folderId)}' in parents`);
        delete input.folderId;
      }
      return flags;
    },
  },

  // --- Docs (9) ---
  gdocs_create: { args: ["docs", "documents", "create"] },
  gdocs_read: {
    args: ["docs", "documents", "get"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.documentId) {
        flags.push("--document-id", String(input.documentId));
        delete input.documentId;
      }
      return flags;
    },
  },
  gdocs_get_metadata: {
    args: ["docs", "documents", "get"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.documentId) {
        flags.push("--document-id", String(input.documentId));
        delete input.documentId;
      }
      return flags;
    },
  },
  gdocs_list_documents: {
    args: ["drive", "files", "list"],
    transformInput: () => {
      return ["--q", "mimeType='application/vnd.google-apps.document'"];
    },
  },
  gdocs_insert_text: {
    args: ["docs", "documents", "batchUpdate"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.documentId) {
        flags.push("--document-id", String(input.documentId));
        delete input.documentId;
      }
      const insertIndex = input.index !== undefined ? Number(input.index) : 1;
      delete input.index;
      const text = String(input.text ?? "");
      delete input.text;
      flags.push(
        "--request-body",
        JSON.stringify({ requests: [{ insertText: { location: { index: insertIndex }, text } }] }),
      );
      return flags;
    },
  },
  gdocs_update_text: {
    args: ["docs", "documents", "batchUpdate"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.documentId) {
        flags.push("--document-id", String(input.documentId));
        delete input.documentId;
      }
      const startIndex = Number(input.startIndex ?? 0);
      const endIndex = Number(input.endIndex ?? 0);
      const text = String(input.text ?? "");
      delete input.startIndex;
      delete input.endIndex;
      delete input.text;
      flags.push(
        "--request-body",
        JSON.stringify({
          requests: [
            { deleteContentRange: { range: { startIndex, endIndex } } },
            { insertText: { location: { index: startIndex }, text } },
          ],
        }),
      );
      return flags;
    },
  },
  gdocs_append_text: {
    args: ["docs", "documents", "batchUpdate"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.documentId) {
        flags.push("--document-id", String(input.documentId));
        delete input.documentId;
      }
      const text = String(input.text ?? "");
      delete input.text;
      // endOfSegmentLocation appends to end of body
      flags.push("--request-body", JSON.stringify({ requests: [{ insertText: { endOfSegmentLocation: {}, text } }] }));
      return flags;
    },
  },
  gdocs_replace_text: {
    args: ["docs", "documents", "batchUpdate"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.documentId) {
        flags.push("--document-id", String(input.documentId));
        delete input.documentId;
      }
      const find = String(input.find ?? "");
      const replaceWith = String(input.replaceWith ?? "");
      delete input.find;
      delete input.replaceWith;
      flags.push(
        "--request-body",
        JSON.stringify({
          requests: [{ replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replaceWith } }],
        }),
      );
      return flags;
    },
  },
  gdocs_export: {
    args: ["drive", "files", "export"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.documentId) {
        flags.push("--file-id", String(input.documentId));
        delete input.documentId;
      }
      if (input.mimeType) {
        flags.push("--mime-type", String(input.mimeType));
        delete input.mimeType;
      }
      return flags;
    },
  },

  // --- Sheets (6) ---
  gsheets_read: { args: ["sheets", "spreadsheets", "values", "get"] },
  gsheets_list_sheets: { args: ["sheets", "spreadsheets", "get"] },
  gsheets_create_spreadsheet: { args: ["sheets", "spreadsheets", "create"] },
  gsheets_update_cell: { args: ["sheets", "spreadsheets", "values", "update"] },
  gsheets_append_data: { args: ["sheets", "spreadsheets", "values", "append"] },
  gsheets_batch_update: { args: ["sheets", "spreadsheets", "batchUpdate"] },

  // --- Gmail (4) ---
  gmail_search_messages: {
    args: ["gmail", "users", "messages", "list"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.query) {
        flags.push("--q", String(input.query));
        delete input.query;
      }
      if (input.max_results) {
        flags.push("--max-results", String(input.max_results));
        delete input.max_results;
      }
      return flags;
    },
  },
  gmail_get_message: {
    args: ["gmail", "users", "messages", "get"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.messageId) {
        flags.push("--id", String(input.messageId));
        delete input.messageId;
      }
      return flags;
    },
  },
  gmail_send_message: { args: ["gmail", "users", "messages", "send"] },
  gmail_draft_message: { args: ["gmail", "users", "drafts", "create"] },

  // --- Calendar (5) ---
  calendar_list_events: {
    args: ["calendar", "events", "list"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.calendarId) {
        flags.push("--calendar-id", String(input.calendarId));
        delete input.calendarId;
      }
      return flags;
    },
  },
  calendar_get_event: {
    args: ["calendar", "events", "get"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.calendarId) {
        flags.push("--calendar-id", String(input.calendarId));
        delete input.calendarId;
      }
      if (input.eventId) {
        flags.push("--event-id", String(input.eventId));
        delete input.eventId;
      }
      return flags;
    },
  },
  calendar_create_event: {
    args: ["calendar", "events", "insert"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.calendarId) {
        flags.push("--calendar-id", String(input.calendarId));
        delete input.calendarId;
      }
      return flags;
    },
  },
  calendar_update_event: {
    args: ["calendar", "events", "patch"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.calendarId) {
        flags.push("--calendar-id", String(input.calendarId));
        delete input.calendarId;
      }
      if (input.eventId) {
        flags.push("--event-id", String(input.eventId));
        delete input.eventId;
      }
      return flags;
    },
  },
  calendar_delete_event: {
    args: ["calendar", "events", "delete"],
    transformInput: (input) => {
      const flags: string[] = [];
      if (input.calendarId) {
        flags.push("--calendar-id", String(input.calendarId));
        delete input.calendarId;
      }
      if (input.eventId) {
        flags.push("--event-id", String(input.eventId));
        delete input.eventId;
      }
      return flags;
    },
  },
};

/**
 * Map MCP tool names to gws CLI arguments.
 * "drive_list_files" → ["drive", "files", "list"]
 * "gdocs_create" → ["docs", "documents", "create"]
 *
 * Exported for testing.
 */
export function toolNameToCliArgs(toolName: string, input: Record<string, unknown>): string[] | null {
  const mapping = CLI_MAP[toolName];
  if (!mapping) return null;

  // Clone input so transformers can safely mutate
  const inputCopy = { ...input };

  // Run optional input transformer to get extra flags
  const extraFlags = mapping.transformInput ? mapping.transformInput(inputCopy) : [];

  // Append remaining input parameters as CLI flags
  const autoFlags: string[] = [];
  for (const [key, value] of Object.entries(inputCopy)) {
    if (value !== undefined && value !== null && value !== "") {
      // Skip arrays/objects — they were already handled by transformer or need special treatment
      if (typeof value === "object") continue;
      autoFlags.push(`--${camelToKebab(key)}`, String(value));
    }
  }

  return [...mapping.args, ...extraFlags, ...autoFlags];
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
