import { AppConfig } from "../utils/config";
import { LLMRequest, LLMResponse } from "./types";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export async function callPerplexity(
  config: AppConfig,
  request: LLMRequest
): Promise<LLMResponse> {
  if (!config.perplexityApiKey) {
    throw new Error("PERPLEXITY_API_KEY is not configured");
  }

  const start = Date.now();

  const messages: Array<{ role: string; content: string }> = [];
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }
  messages.push({ role: "user", content: request.userPrompt });

  const res = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.perplexityApiKey}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Perplexity API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];

  return {
    text: choice?.message?.content ?? "",
    model: "sonar",
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
    durationMs: Date.now() - start,
  };
}
