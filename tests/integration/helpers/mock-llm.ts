/**
 * Mock LLM layer for integration tests.
 *
 * Returns predefined responses per model alias.
 */

import { LLMResponse } from "../../../src/llm/types";

export type MockResponseMap = Record<string, LLMResponse>;

export function createMockLlm(responses: MockResponseMap) {
  return (_config: any, _logger: any, routing: any, taskType: string, request: any): Promise<LLMResponse> => {
    // Determine which model would be selected
    const entry = routing[taskType] ?? routing.default;
    const alias = typeof entry === "string" ? entry : (entry?.primary ?? "unknown");

    const response = responses[alias];
    if (!response) {
      throw new Error(`No mock response configured for model alias: ${alias}`);
    }

    return Promise.resolve({ ...response });
  };
}

export const FIXTURES = {
  blogPostResponse: {
    text: "# AI i marknadsföring\n\nForefront ser framåt. Vi tror på modig innovation...",
    model: "claude-opus-4-6",
    tokensIn: 2340,
    tokensOut: 1580,
    durationMs: 3200,
    costUsd: 0.15,
  } satisfies LLMResponse,

  selfEvalPass: {
    text: "",
    model: "claude-sonnet-4-6",
    tokensIn: 500,
    tokensOut: 50,
    durationMs: 800,
    costUsd: 0.002,
    toolUse: {
      toolName: "self_eval_response",
      input: { pass: true, score: 0.85, issues: [] },
    },
  } satisfies LLMResponse,

  selfEvalFail: {
    text: "",
    model: "claude-sonnet-4-6",
    tokensIn: 500,
    tokensOut: 80,
    durationMs: 900,
    costUsd: 0.002,
    toolUse: {
      toolName: "self_eval_response",
      input: {
        pass: false,
        score: 0.55,
        issues: ["Passivt språk i stycke 2", "Saknar CTA"],
      },
    },
  } satisfies LLMResponse,

  brandReviewApproved: {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 800,
    tokensOut: 60,
    durationMs: 1200,
    costUsd: 0.02,
    toolUse: {
      toolName: "brand_review_decision",
      input: { decision: "approved", feedback: "Bra tonalitet och tydlig poäng." },
    },
  } satisfies LLMResponse,

  brandReviewRejected: {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 800,
    tokensOut: 100,
    durationMs: 1500,
    costUsd: 0.02,
    toolUse: {
      toolName: "brand_review_decision",
      input: { decision: "rejected", feedback: "Passivt språk. Saknar tydlig poäng." },
    },
  } satisfies LLMResponse,

  quickScreenPass: {
    text: "",
    model: "claude-sonnet-4-6",
    tokensIn: 200,
    tokensOut: 30,
    durationMs: 500,
    costUsd: 0.001,
    toolUse: {
      toolName: "quick_screen_response",
      input: { flagged: false, issues: [] },
    },
  } satisfies LLMResponse,

  quickScreenFlagged: {
    text: "",
    model: "claude-sonnet-4-6",
    tokensIn: 200,
    tokensOut: 50,
    durationMs: 600,
    costUsd: 0.001,
    toolUse: {
      toolName: "quick_screen_response",
      input: {
        flagged: true,
        issues: ["Passivt språk i inledningen"],
      },
    },
  } satisfies LLMResponse,
};
