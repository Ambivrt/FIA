export type ModelAlias =
  | "claude-opus"
  | "claude-sonnet"
  | "nano-banana-2"
  | "google-search";

export type ModelId =
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "gemini-2.0-flash-preview-image-generation"
  | "google-custom-search";

export const MODEL_MAP: Record<ModelAlias, ModelId> = {
  "claude-opus": "claude-opus-4-6",
  "claude-sonnet": "claude-sonnet-4-6",
  "nano-banana-2": "gemini-2.0-flash-preview-image-generation",
  "google-search": "google-custom-search",
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

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
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
