export type ModelAlias =
  | "gemini-pro"
  | "gemini-flash"
  | "nano-banana-2"
  | "perplexity";

export type ModelId =
  | "gemini-2.5-pro-preview-06-05"
  | "gemini-2.5-flash-preview-05-20"
  | "gemini-2.0-flash-preview-image-generation"
  | "sonar";

export const MODEL_MAP: Record<ModelAlias, ModelId> = {
  "gemini-pro": "gemini-2.5-pro-preview-06-05",
  "gemini-flash": "gemini-2.5-flash-preview-05-20",
  "nano-banana-2": "gemini-2.0-flash-preview-image-generation",
  "perplexity": "sonar",
};

export interface LLMRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  aspectRatio?: string;
}

export interface ImageGenerationResponse {
  imageData: Buffer;
  mimeType: string;
  model: string;
  durationMs: number;
}
