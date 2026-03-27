import { GoogleGenAI } from "@google/genai";
import { AppConfig } from "../utils/config";
import { ImageGenerationRequest, ImageGenerationResponse } from "./types";
import { calculateFlatCostUsd } from "./pricing";
import { withRetry } from "./retry";

const IMAGE_MODEL = "gemini-2.5-flash-image";

export async function generateImage(
  config: AppConfig,
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Cannot generate images without a valid API key.");
  }
  const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

  return withRetry(async () => {
    const start = Date.now();
    const response = await client.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => "inlineData" in p && p.inlineData);

    if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData) {
      throw new Error("No image returned from Nano Banana 2");
    }

    const inlineData = imagePart.inlineData as { data: string; mimeType: string };

    return {
      imageData: Buffer.from(inlineData.data, "base64"),
      mimeType: inlineData.mimeType || "image/png",
      model: IMAGE_MODEL,
      durationMs: Date.now() - start,
      costUsd: calculateFlatCostUsd(IMAGE_MODEL),
    };
  });
}
