/**
 * Quick brand screening for high-risk content.
 *
 * Runs after content generation but before formal Brand review as an early warning.
 * Uses a cheaper model (default: claude-sonnet) and a short prompt focused on
 * the top 3 brand rejection reasons.
 */

import { AppConfig } from "../../utils/config";
import { Logger } from "../../gateway/logger";
import { routeRequest, AgentRouting } from "../../gateway/router";
import { ModelAlias, ToolDefinition } from "../../llm/types";

const DEFAULT_SCREEN_MODEL: ModelAlias = "claude-sonnet";

const QUICK_SCREEN_TOOL: ToolDefinition = {
  name: "quick_screen_response",
  description: "Returnera snabb varumärkesscreening",
  input_schema: {
    type: "object",
    properties: {
      flagged: {
        type: "boolean",
        description: "true om varumärkesproblem hittades",
      },
      issues: {
        type: "array",
        items: { type: "string" },
        description: "Specifika varumärkesproblem, tomma om flagged=false",
      },
    },
    required: ["flagged", "issues"],
  },
};

export interface QuickScreenResult {
  flagged: boolean;
  issues: string[];
}

export async function quickBrandScreen(
  config: AppConfig,
  logger: Logger,
  content: string,
  taskType: string,
  model: ModelAlias = DEFAULT_SCREEN_MODEL,
): Promise<QuickScreenResult> {
  const prompt = [
    "Du är en snabb varumärkesscreening. Kolla ENBART dessa tre saker:",
    "1. Tonalitet: Följer texten Forefronts ton? (klok kollega, konkret, nyfiken, aktiv röst)",
    "2. Passivt språk: Finns passiva konstruktioner som borde vara aktiva?",
    "3. Varumärkeskonsistens: Stämmer texten med Forefronts karaktär? (Modig, Hängiven, Lustfylld)",
    "",
    "Detta är en SNABB screening – inte en fullständig granskning.",
    "Flagga bara uppenbara problem. Använd verktyget quick_screen_response.",
    "",
    `Innehållstyp: ${taskType}`,
    "",
    "--- INNEHÅLL ---",
    content,
  ].join("\n");

  const evalRouting: AgentRouting = {
    default: model,
  };

  const response = await routeRequest(config, logger, evalRouting, "quick_screen", {
    userPrompt: prompt,
    maxTokens: 500,
    tools: [QUICK_SCREEN_TOOL],
    toolChoice: { type: "tool", name: "quick_screen_response" },
  });

  if (response.toolUse && response.toolUse.toolName === "quick_screen_response") {
    const input = response.toolUse.input as { flagged: boolean; issues: string[] };
    return {
      flagged: Boolean(input.flagged),
      issues: input.issues ?? [],
    };
  }

  // Fallback: no issues found
  return { flagged: false, issues: [] };
}

const HIGH_RISK_TYPES = new Set(["case_study", "whitepaper", "newsletter", "press_release"]);

export function isHighRiskContent(taskType: string, sampleReviewRate: number): boolean {
  return HIGH_RISK_TYPES.has(taskType) || sampleReviewRate >= 1.0;
}
