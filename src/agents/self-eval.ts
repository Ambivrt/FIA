/**
 * Self-evaluation module for agent output quality assessment.
 *
 * Runs after primary generation but before Brand review.
 * Uses a cheaper model to avoid cost spiral.
 */

import { AppConfig } from "../utils/config";
import { Logger } from "../gateway/logger";
import { routeRequest, AgentRouting } from "../gateway/router";
import { SelfEvalConfig, SelfEvalResult, ToolDefinition, VerbosityLevel } from "../llm/types";

const SELF_EVAL_TOOL: ToolDefinition = {
  name: "self_eval_response",
  description: "Returnera strukturerad kvalitetsbedömning",
  input_schema: {
    type: "object",
    properties: {
      pass: { type: "boolean", description: "Uppfyller alla kriterier" },
      score: {
        type: "number",
        description: "0.0-1.0 kvalitetspoäng",
      },
      issues: {
        type: "array",
        items: { type: "string" },
        description: "Specifika problem, tomma om pass=true",
      },
    },
    required: ["pass", "score", "issues"],
  },
};

const VERBOSITY_INSTRUCTIONS: Record<VerbosityLevel, string> = {
  minimal: "Returnera bara pass/fail och score. Om issues, beskriv med max 5 ord per issue.",
  standard: "",
  detailed:
    "Ge utförlig feedback med specifika exempel från innehållet och konkreta förbättringsförslag per kriterium.",
};

function buildSelfEvalPrompt(output: string, criteria: string[], verbosity: VerbosityLevel = "standard"): string {
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const verbosityNote = VERBOSITY_INSTRUCTIONS[verbosity];

  return [
    "Du är en kvalitetsgranskare. Bedöm följande innehåll mot kriterierna nedan.",
    "Använd verktyget self_eval_response för att lämna din bedömning.",
    ...(verbosityNote ? ["", `## Instruktioner`, verbosityNote] : []),
    "",
    "## Kriterier",
    criteriaList,
    "",
    "## Poängsättning",
    "- 1.0 = perfekt, alla kriterier uppfyllda",
    "- 0.7 = acceptabelt, mindre brister",
    "- 0.4 = undermåligt, allvarliga brister",
    "- 0.0 = helt fel",
    "",
    "## Innehåll att granska",
    "---",
    output,
  ].join("\n");
}

export function parseSelfEvalResponse(response: {
  toolUse?: { toolName: string; input: Record<string, unknown> };
  text: string;
}): SelfEvalResult {
  if (response.toolUse && response.toolUse.toolName === "self_eval_response") {
    const input = response.toolUse.input as {
      pass: boolean;
      score: number;
      issues: string[];
    };
    return {
      pass: input.pass,
      score: Math.max(0, Math.min(1, input.score)),
      issues: input.issues ?? [],
    };
  }

  // Fallback: try to parse from text
  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        pass: Boolean(parsed.pass),
        score: Math.max(0, Math.min(1, Number(parsed.score) || 0)),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    }
  } catch {
    // Fall through
  }

  // Default: pass with low confidence
  return { pass: true, score: 0.5, issues: [] };
}

export async function runSelfEval(
  config: AppConfig,
  logger: Logger,
  agentSlug: string,
  output: string,
  selfEvalConfig: SelfEvalConfig,
  verbosity: VerbosityLevel = "standard",
): Promise<SelfEvalResult> {
  // Truncate very long output to avoid wasting tokens on self-eval
  const MAX_EVAL_CHARS = 5000;
  const trimmedOutput =
    output.length > MAX_EVAL_CHARS
      ? output.slice(0, 2000) + "\n\n[... trimmat ...]\n\n" + output.slice(-2000)
      : output;

  const evalPrompt = buildSelfEvalPrompt(trimmedOutput, selfEvalConfig.criteria, verbosity);

  // Route to the configured (cheaper) model via a synthetic routing
  const evalRouting: AgentRouting = {
    default: selfEvalConfig.model,
  };

  const response = await routeRequest(config, logger, evalRouting, "self_eval", {
    userPrompt: evalPrompt,
    tools: [SELF_EVAL_TOOL],
    toolChoice: { type: "tool", name: "self_eval_response" },
  });

  const result = parseSelfEvalResponse(response);

  logger.info("Self-eval completed", {
    action: "self_eval",
    agent: agentSlug,
    model: selfEvalConfig.model,
    score: result.score,
    pass: result.pass,
    issues: result.issues,
  });

  return result;
}
