import { GoogleGenAI } from "@google/genai";
import { AppConfig } from "../utils/config";
import { LLMRequest, LLMResponse } from "./types";
import { calculateCostUsd } from "./pricing";
import { withRetry } from "./retry";

let clientInstance: GoogleGenAI | null = null;
let clientApiKey: string | null = null;

function getClient(config: AppConfig): GoogleGenAI {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Cannot call Gemini API without a valid API key.");
  }
  if (!clientInstance || clientApiKey !== config.geminiApiKey) {
    clientInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
    clientApiKey = config.geminiApiKey;
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

      // Surface clear message for auth failures (invalid/expired GEMINI_API_KEY)
      const errMsg = (err as Error).message ?? "";
      const status = (err as any).status ?? (err as any).statusCode;
      if (status === 401 || errMsg.includes("UNAUTHENTICATED") || errMsg.includes("invalid authentication")) {
        throw new Error(
          `Gemini API autentisering misslyckades (401). Kontrollera att GEMINI_API_KEY i .env är en giltig Google AI Studio API-nyckel. ` +
            `Originalfel: ${errMsg}`,
        );
      }

      throw err;
    } finally {
      clearTimeout(timer);
    }
  });
}
