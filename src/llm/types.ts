export type ModelAlias =
  | "claude-opus"
  | "claude-sonnet"
  | "gemini-pro"
  | "gemini-flash"
  | "nano-banana-2"
  | "google-search";

export type ModelId =
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-image"
  | "google-custom-search";

export const MODEL_MAP: Record<ModelAlias, ModelId> = {
  "claude-opus": "claude-opus-4-6",
  "claude-sonnet": "claude-sonnet-4-6",
  "gemini-pro": "gemini-2.5-pro",
  "gemini-flash": "gemini-2.5-flash",
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
  images?: Array<{ data: string; mediaType: string }>;
}

export interface LLMResponse {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
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

// --- Routing types ---

export interface RoutingEntry {
  primary: ModelAlias;
  fallback?: ModelAlias;
}

/**
 * Normalize a routing value from agent.yaml.
 * Supports both string (legacy) and object { primary, fallback } formats.
 */
export function normalizeRoutingEntry(entry: string | RoutingEntry): RoutingEntry {
  if (typeof entry === "string") return { primary: entry as ModelAlias };
  return entry;
}

// --- Self-eval types ---

export type VerbosityLevel = "minimal" | "standard" | "detailed";
export type ComplianceMode = "strict" | "balanced" | "open";

export interface SelfEvalConfig {
  enabled: boolean;
  model: ModelAlias;
  criteria: string[];
  threshold: number;
  verbosity?: VerbosityLevel;
}

export interface SelfEvalResult {
  pass: boolean;
  score: number;
  issues: string[];
}

// --- Pipeline metadata ---

export interface PipelineData {
  generation?: {
    model: string;
    tokens_in: number;
    tokens_out: number;
  };
  self_eval?: SelfEvalResult & {
    revision_triggered: boolean;
    model: string;
  };
  parallel_screening?: {
    flagged: boolean;
    issues: string[];
    model: string;
  };
}
