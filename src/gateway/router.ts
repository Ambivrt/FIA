import { AppConfig } from "../utils/config";
import {
  LLMRequest,
  LLMResponse,
  ModelAlias,
  MODEL_MAP,
  ImageGenerationRequest,
  ImageGenerationResponse,
  RoutingEntry,
  normalizeRoutingEntry,
} from "../llm/types";
import { callClaude } from "../llm/claude";
import { callGemini } from "../llm/gemini";
import { searchGoogle } from "../llm/google-search";
import { generateImage } from "../llm/nano-banana";
import { calculateFlatCostUsd } from "../llm/pricing";
import { isRetryableError } from "../llm/retry";
import { Logger } from "./logger";

export interface AgentRouting {
  default: string | RoutingEntry;
  [taskType: string]: string | RoutingEntry;
}

export interface RouteResult {
  alias: ModelAlias;
  modelId: string;
  provider: "claude" | "gemini" | "google-search" | "nano-banana";
}

export function resolveRoute(routing: AgentRouting, taskType: string): RouteResult {
  const raw = routing[taskType] ?? routing.default;
  const { primary } = normalizeRoutingEntry(raw as string | RoutingEntry);
  return aliasToRoute(primary);
}

export function resolveRouteWithFallback(
  routing: AgentRouting,
  taskType: string,
): { primary: RouteResult; fallback?: RouteResult } {
  const raw = routing[taskType] ?? routing.default;
  const entry = normalizeRoutingEntry(raw as string | RoutingEntry);
  return {
    primary: aliasToRoute(entry.primary),
    fallback: entry.fallback ? aliasToRoute(entry.fallback) : undefined,
  };
}

function aliasToRoute(alias: ModelAlias): RouteResult {
  const modelId = MODEL_MAP[alias];
  if (!modelId) throw new Error(`Unknown model alias: ${alias}`);

  let provider: RouteResult["provider"];
  if (alias === "claude-opus" || alias === "claude-sonnet") {
    provider = "claude";
  } else if (alias === "gemini-pro" || alias === "gemini-flash") {
    provider = "gemini";
  } else if (alias === "google-search") {
    provider = "google-search";
  } else if (alias === "nano-banana-2") {
    provider = "nano-banana";
  } else {
    throw new Error(`Unknown model alias: ${alias}`);
  }

  return { alias, modelId, provider };
}

async function callProvider(config: AppConfig, route: RouteResult, request: LLMRequest): Promise<LLMResponse> {
  switch (route.provider) {
    case "claude":
      return callClaude(config, route.modelId, request);
    case "gemini":
      return callGemini(config, route.modelId, request);
    case "google-search": {
      const start = Date.now();
      const results = await searchGoogle(config, request.userPrompt);
      const text = results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`).join("\n\n");
      return {
        text,
        model: "google-custom-search",
        tokensIn: 0,
        tokensOut: 0,
        durationMs: Date.now() - start,
        costUsd: calculateFlatCostUsd("google-custom-search"),
      };
    }
    default:
      throw new Error(`Cannot route text request to provider: ${route.provider}`);
  }
}

export async function routeRequest(
  config: AppConfig,
  logger: Logger,
  routing: AgentRouting,
  taskType: string,
  request: LLMRequest,
): Promise<LLMResponse> {
  const { primary, fallback } = resolveRouteWithFallback(routing, taskType);

  logger.debug(`Routing ${taskType} → ${primary.alias} (${primary.modelId})`, {
    action: "route_request",
    model: primary.modelId,
  });

  try {
    return await callProvider(config, primary, request);
  } catch (error) {
    if (fallback && isRetryableError(error)) {
      logger.warn(`Primary model ${primary.alias} failed, falling back to ${fallback.alias}`, {
        action: "model_fallback",
        task_type: taskType,
        primary: primary.alias,
        fallback: fallback.alias,
        error: (error as Error).message,
      });
      return await callProvider(config, fallback, request);
    }
    throw error;
  }
}

export async function routeImageRequest(
  config: AppConfig,
  logger: Logger,
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  logger.debug("Routing image generation → nano-banana-2", {
    action: "route_image",
    model: MODEL_MAP["nano-banana-2"],
  });

  return generateImage(config, request);
}
