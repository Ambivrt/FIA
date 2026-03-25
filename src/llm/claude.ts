import Anthropic from "@anthropic-ai/sdk";
import { AppConfig } from "../utils/config";
import { LLMRequest, LLMResponse, ToolUseResult } from "./types";
import { calculateCostUsd } from "./pricing";
import { withRetry } from "./retry";

let clientInstance: Anthropic | null = null;

function getClient(config: AppConfig): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return clientInstance;
}

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

export async function callClaude(config: AppConfig, model: string, request: LLMRequest): Promise<LLMResponse> {
  const client = getClient(config);
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return withRetry(async () => {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Build user message content (multimodal when images are present)
      const userContent: Anthropic.ContentBlockParam[] = [];
      if (request.images && request.images.length > 0) {
        for (const img of request.images) {
          userContent.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              data: img.data,
            },
          });
        }
      }
      userContent.push({ type: "text", text: request.userPrompt });

      const createParams: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.systemPrompt ?? "",
        messages: [{ role: "user", content: userContent }],
        temperature: request.temperature ?? 0.7,
      };

      if (request.tools && request.tools.length > 0) {
        createParams.tools = request.tools as Anthropic.Tool[];
      }
      if (request.toolChoice) {
        createParams.tool_choice = request.toolChoice as Anthropic.ToolChoice;
      }

      const response = await client.messages.create(createParams, { signal: controller.signal });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      // Extract tool use block if present
      let toolUse: ToolUseResult | undefined;
      const toolUseBlock = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
      if (toolUseBlock) {
        toolUse = {
          toolName: toolUseBlock.name,
          input: toolUseBlock.input as Record<string, unknown>,
        };
      }

      const tokensIn = response.usage.input_tokens;
      const tokensOut = response.usage.output_tokens;

      return {
        text,
        model,
        tokensIn,
        tokensOut,
        durationMs: Date.now() - start,
        costUsd: calculateCostUsd(model, tokensIn, tokensOut),
        toolUse,
      };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Claude API timeout after ${timeoutMs / 1000}s (model: ${model})`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  });
}
