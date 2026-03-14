import { AppConfig } from "../utils/config";
import { LLMRequest, LLMResponse, ModelAlias, MODEL_MAP, ImageGenerationRequest, ImageGenerationResponse, SearchResult } from "../llm/types";
import { callClaude } from "../llm/claude";
import { searchGoogle } from "../llm/google-search";
import { generateImage } from "../llm/nano-banana";
import { Logger } from "./logger";

export interface AgentRouting {
  default: ModelAlias;
  [taskType: string]: ModelAlias;
}

export interface RouteResult {
  alias: ModelAlias;
  modelId: string;
  provider: "claude" | "google-search" | "nano-banana";
}

export function resolveRoute(routing: AgentRouting, taskType: string): RouteResult {
  const alias = routing[taskType] ?? routing.default;
  const modelId = MODEL_MAP[alias];

  let provider: RouteResult["provider"];
  if (alias === "claude-opus" || alias === "claude-sonnet") {
    provider = "claude";
  } else if (alias === "google-search") {
    provider = "google-search";
  } else if (alias === "nano-banana-2") {
    provider = "nano-banana";
  } else {
    throw new Error(`Unknown model alias: ${alias}`);
  }

  return { alias, modelId, provider };
}

export async function routeRequest(
  config: AppConfig,
  logger: Logger,
  routing: AgentRouting,
  taskType: string,
  request: LLMRequest
): Promise<LLMResponse> {
  const route = resolveRoute(routing, taskType);

  logger.debug(`Routing ${taskType} → ${route.alias} (${route.modelId})`, {
    action: "route_request",
    model: route.modelId,
  });

  switch (route.provider) {
    case "claude":
      return callClaude(config, route.modelId, request);
    case "google-search": {
      // Google Search returns search results, not a generative response.
      // Wrap results as an LLM-style response for uniform handling.
      const start = Date.now();
      const results = await searchGoogle(config, request.userPrompt);
      const text = results
        .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`)
        .join("\n\n");
      return {
        text,
        model: "google-custom-search",
        tokensIn: 0,
        tokensOut: 0,
        durationMs: Date.now() - start,
      };
    }
    default:
      throw new Error(`Cannot route text request to provider: ${route.provider}`);
  }
}

export async function routeImageRequest(
  config: AppConfig,
  logger: Logger,
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  logger.debug("Routing image generation → nano-banana-2", {
    action: "route_image",
    model: MODEL_MAP["nano-banana-2"],
  });

  return generateImage(config, request);
}
