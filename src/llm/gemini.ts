import { GoogleGenAI } from "@google/genai";
import { AppConfig } from "../utils/config";
import { LLMRequest, LLMResponse, ModelId } from "./types";

let clientInstance: GoogleGenAI | null = null;

function getClient(config: AppConfig): GoogleGenAI {
  if (!clientInstance) {
    clientInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return clientInstance;
}

export async function callGemini(
  config: AppConfig,
  model: ModelId,
  request: LLMRequest
): Promise<LLMResponse> {
  const client = getClient(config);
  const start = Date.now();

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  if (request.systemPrompt) {
    contents.push({ role: "user", parts: [{ text: request.systemPrompt }] });
    contents.push({ role: "model", parts: [{ text: "Understood. I will follow these instructions." }] });
  }
  contents.push({ role: "user", parts: [{ text: request.userPrompt }] });

  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 4096,
    },
  });

  const text = response.text ?? "";
  const usage = response.usageMetadata;

  return {
    text,
    model,
    tokensIn: usage?.promptTokenCount ?? 0,
    tokensOut: usage?.candidatesTokenCount ?? 0,
    durationMs: Date.now() - start,
  };
}
