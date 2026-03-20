/**
 * Tool Registry — central dispatcher for agent tools.
 *
 * Reads an agent's `tools` field from its manifest and:
 * 1. Builds ToolDefinition[] for LLM tool_use
 * 2. Dispatches tool_use results to the correct wrapper (GWS, HubSpot, etc.)
 */

import { ToolDefinition, ToolUseResult } from "../llm/types";
import { AppConfig } from "../utils/config";
import { buildGwsToolDefinitions, handleGwsToolUse, isGwsTool } from "./gws";

/**
 * Build all ToolDefinitions for an agent based on its manifest tools list.
 */
export async function buildToolDefinitions(agentTools: string[]): Promise<ToolDefinition[]> {
  const definitions: ToolDefinition[] = [];

  // GWS tools
  const gwsDefs = await buildGwsToolDefinitions(agentTools);
  definitions.push(...gwsDefs);

  // Future: HubSpot, LinkedIn, Buffer tools
  // if (agentTools.includes('hubspot')) { ... }

  return definitions;
}

/**
 * Dispatch a tool_use call to the correct handler.
 * Returns the tool result as a string (JSON or text).
 */
export async function dispatchToolUse(toolUse: ToolUseResult, config: AppConfig): Promise<string> {
  if (isGwsTool(toolUse.toolName)) {
    return handleGwsToolUse(toolUse, config);
  }

  // Future: other tool dispatchers
  // if (isHubSpotTool(toolUse.toolName)) { ... }

  throw new Error(`Unknown tool: "${toolUse.toolName}" — no handler registered`);
}

/**
 * Check if an agent has any tools configured.
 */
export function hasTools(agentTools: string[]): boolean {
  return agentTools.length > 0 && agentTools.some((t) => t.startsWith("gws:"));
}
