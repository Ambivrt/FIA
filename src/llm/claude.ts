import Anthropic from "@anthropic-ai/sdk";
import { AppConfig } from "../utils/config";
import { LLMRequest, LLMResponse } from "./types";

let clientInstance: Anthropic | null = null;

function getClient(config: AppConfig): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return clientInstance;
}

export async function callClaude(
  config: AppConfig,
  model: string,
  request: LLMRequest
): Promise<LLMResponse> {
  const client = getClient(config);
  const start = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: request.maxTokens ?? 4096,
    system: request.systemPrompt ?? "",
    messages: [{ role: "user", content: request.userPrompt }],
    temperature: request.temperature ?? 0.7,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    text,
    model,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    durationMs: Date.now() - start,
  };
}
