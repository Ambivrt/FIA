import { AppConfig } from "../utils/config";
import { LLMRequest, LLMResponse, ModelAlias, MODEL_MAP, ImageGenerationRequest, ImageGenerationResponse } from "../llm/types";
import { callGemini } from "../llm/gemini";
import { callPerplexity } from "../llm/perplexity";
import { generateImage } from "../llm/nano-banana";
import { Logger } from "./logger";

export interface AgentRouting {
  default: ModelAlias;
  [taskType: string]: ModelAlias;
}

export interface RouteResult {
  alias: ModelAlias;
  modelId: string;
  provider: "gemini" | "perplexity" | "nano-banana";
}

export function resolveRoute(routing: AgentRouting, taskType: string): RouteResult {
  const alias = routing[taskType] ?? routing.default;
  const modelId = MODEL_MAP[alias];

  let provider: RouteResult["provider"];
  if (alias === "perplexity") {
    provider = "perplexity";
  } else if (alias === "nano-banana-2") {
    provider = "nano-banana";
  } else {
    provider = "gemini";
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
    case "gemini":
      return callGemini(config, route.modelId as any, request);
    case "perplexity":
      return callPerplexity(config, request);
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
