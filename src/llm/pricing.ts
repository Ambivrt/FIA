/**
 * Model pricing and cost calculation.
 *
 * Prices in USD. Conversion to SEK via configurable exchange rate.
 */

export interface ModelPricing {
  inputPer1MTokens: number;
  outputPer1MTokens: number;
}

/** Token-based pricing per model ID */
const TOKEN_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { inputPer1MTokens: 15, outputPer1MTokens: 75 },
  "claude-sonnet-4-6": { inputPer1MTokens: 3, outputPer1MTokens: 15 },
};

/** Flat per-call pricing (USD) for non-token models */
const FLAT_PRICING: Record<string, number> = {
  "gemini-2.5-flash-image": 0.04, // per image
  "google-custom-search": 0.001, // per search
};

export function calculateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = TOKEN_PRICING[model];
  if (pricing) {
    return (tokensIn / 1_000_000) * pricing.inputPer1MTokens + (tokensOut / 1_000_000) * pricing.outputPer1MTokens;
  }

  // Flat-rate model
  const flat = FLAT_PRICING[model];
  if (flat !== undefined) return flat;

  return 0;
}

export function calculateFlatCostUsd(model: string): number {
  return FLAT_PRICING[model] ?? 0;
}

export function usdToSek(costUsd: number, exchangeRate: number): number {
  return Math.round(costUsd * exchangeRate * 10000) / 10000; // 4 decimal precision
}
