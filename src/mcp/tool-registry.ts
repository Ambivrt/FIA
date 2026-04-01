/**
 * Tool Registry — central dispatcher for agent tools.
 *
 * Reads an agent's `tools` field from its manifest and:
 * 1. Builds ToolDefinition[] for LLM tool_use
 * 2. Dispatches tool_use results to the correct wrapper (GWS, GA4, Workvivo, etc.)
 */

import { ToolDefinition, ToolUseResult } from "../llm/types";
import { AppConfig } from "../utils/config";
import { buildGwsToolDefinitions, handleGwsToolUse, isGwsTool } from "./gws";
import { buildGa4ToolDefinitions, handleGa4ToolUse, isGa4Tool } from "./ga4";
import { buildWorkvivoDefs, handleWorkvivo, isWorkvivo } from "./workvivo";

/** Services that the tool registry knows how to handle. */
const KNOWN_SERVICES = ["gws:", "ga4", "workvivo"];

/**
 * Build all ToolDefinitions for an agent based on its manifest tools list.
 */
export async function buildToolDefinitions(agentTools: string[]): Promise<ToolDefinition[]> {
  const definitions: ToolDefinition[] = [];

  // GWS tools
  const gwsDefs = await buildGwsToolDefinitions(agentTools);
  definitions.push(...gwsDefs);

  // GA4 tools (supports both "ga4" and legacy "gws:analytics")
  if (agentTools.includes("ga4") || agentTools.includes("gws:analytics")) {
    const ga4Defs = await buildGa4ToolDefinitions();
    definitions.push(...ga4Defs);
  }

  // Workvivo tools
  if (agentTools.includes("workvivo")) {
    const workvivoDefs = await buildWorkvivoDefs();
    definitions.push(...workvivoDefs);
  }

  // Future: HubSpot, LinkedIn, Buffer tools

  return definitions;
}

/**
 * Dispatch a tool_use call to the correct handler.
 * Returns the tool result as a string (JSON or text).
 */
export async function dispatchToolUse(toolUse: ToolUseResult, config: AppConfig): Promise<string> {
  if (isGa4Tool(toolUse.toolName)) {
    return handleGa4ToolUse(toolUse, config);
  }

  if (isWorkvivo(toolUse.toolName)) {
    return handleWorkvivo(toolUse, config);
  }

  if (isGwsTool(toolUse.toolName)) {
    return handleGwsToolUse(toolUse, config);
  }

  // Future: HubSpot, LinkedIn dispatchers

  throw new Error(`Unknown tool: "${toolUse.toolName}" — no handler registered`);
}

/**
 * Check if an agent has any tools configured.
 */
export function hasTools(agentTools: string[]): boolean {
  return agentTools.length > 0 && agentTools.some((t) => KNOWN_SERVICES.some((s) => t.startsWith(s)));
}
