import { GoogleGenAI } from "@google/genai";
import { AppConfig } from "../utils/config";
import { LLMRequest, LLMResponse } from "./types";
import { calculateCostUsd } from "./pricing";
import { withRetry } from "./retry";

let clientInstance: GoogleGenAI | null = null;

function getClient(config: AppConfig): GoogleGenAI {
  if (!clientInstance) {
    clientInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return clientInstance;
}

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

export async function callGemini(config: AppConfig, model: string, request: LLMRequest): Promise<LLMResponse> {
  const client = getClient(config);
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return withRetry(async () => {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const systemInstruction = request.systemPrompt ? [{ text: request.systemPrompt }] : undefined;

      const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
        config: {
          maxOutputTokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
          systemInstruction: systemInstruction ? { parts: systemInstruction } : undefined,
        },
      });

      const text =
        response.candidates?.[0]?.content?.parts
          ?.filter((p) => "text" in p && p.text)
          .map((p) => p.text)
          .join("") ?? "";

      const tokensIn = response.usageMetadata?.promptTokenCount ?? 0;
      const tokensOut = response.usageMetadata?.candidatesTokenCount ?? 0;

      return {
        text,
        model,
        tokensIn,
        tokensOut,
        durationMs: Date.now() - start,
        costUsd: calculateCostUsd(model, tokensIn, tokensOut),
      };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Gemini API timeout after ${timeoutMs / 1000}s (model: ${model})`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  });
}
