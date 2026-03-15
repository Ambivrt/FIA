export type ModelAlias =
  | "claude-opus"
  | "claude-sonnet"
  | "nano-banana-2"
  | "google-search";

export type ModelId =
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "gemini-2.5-flash-image"
  | "google-custom-search";

export const MODEL_MAP: Record<ModelAlias, ModelId> = {
  "claude-opus": "claude-opus-4-6",
  "claude-sonnet": "claude-sonnet-4-6",
  "nano-banana-2": "gemini-2.5-flash-image",
  "google-search": "google-custom-search",
};

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolUseResult {
  toolName: string;
  input: Record<string, unknown>;
}

export interface LLMRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  tools?: ToolDefinition[];
  toolChoice?: { type: "auto" | "any" | "tool"; name?: string };
}

export interface LLMResponse {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  costUsd: number;
  toolUse?: ToolUseResult;
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
  costUsd: number;
}
