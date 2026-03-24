import { BrandAgent, ReviewRequest, ReviewResult } from "../src/agents/brand/brand-agent";
import { AgentManifest } from "../src/agents/agent-loader";
import { AppConfig } from "../src/utils/config";
import { Logger } from "../src/gateway/logger";
import { LLMResponse } from "../src/llm/types";

// Mock all external dependencies
jest.mock("../src/gateway/router", () => ({
  routeRequest: jest.fn(),
}));
jest.mock("../src/supabase/task-writer", () => ({
  createApproval: jest.fn().mockResolvedValue("approval-id"),
  updateTaskStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/supabase/activity-writer", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/slack/app", () => ({
  getSlackApp: jest.fn().mockReturnValue(null),
}));
jest.mock("../src/slack/handlers", () => ({
  sendEscalation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/context/context-manager", () => ({
  loadBrandContext: jest.fn().mockReturnValue("brand context"),
}));
jest.mock("../src/context/prompt-builder", () => ({
  buildSystemPrompt: jest.fn().mockReturnValue("system prompt"),
  buildTaskPrompt: jest.fn().mockReturnValue("task prompt"),
}));

import { routeRequest } from "../src/gateway/router";
import { createApproval, updateTaskStatus } from "../src/supabase/task-writer";
import { logActivity } from "../src/supabase/activity-writer";

const mockRouteRequest = routeRequest as jest.MockedFunction<typeof routeRequest>;
const mockCreateApproval = createApproval as jest.MockedFunction<typeof createApproval>;
const mockUpdateTaskStatus = updateTaskStatus as jest.MockedFunction<typeof updateTaskStatus>;

const mockConfig: AppConfig = {
  nodeEnv: "test",
  logDir: "/tmp/fia-test-logs",
  logLevel: "debug",
  knowledgeDir: process.cwd() + "/knowledge",
  anthropicApiKey: "test-key",
  geminiApiKey: "",
  serperApiKey: "",
  slackBotToken: "",
  slackAppToken: "",
  slackSigningSecret: "",
  supabaseUrl: "",
  supabaseServiceRoleKey: "",
  supabaseAnonKey: "",
  gwsCredentialsFile: "",
  hubspotApiKey: "",
  linkedinAccessToken: "",
  ga4CredentialsPath: "",
  bufferAccessToken: "",
  gatewayApiHost: "127.0.0.1",
  gatewayApiPort: 3001,
  usdToSek: 10.5,
  queueMaxConcurrency: 3,
};

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockManifest: AgentManifest = {
  name: "Brand Agent",
  slug: "brand",
  version: "1.0.0",
  routing: { default: "claude-opus" },
  system_context: ["SKILL.md"],
  task_context: {},
  tools: [],
  autonomy: "autonomous",
  escalation_threshold: 3,
  sample_review_rate: 0,
  writable: ["memory/rejection-patterns.json"],
};

// Minimal mock for Supabase client
const mockSupabase = {
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "brand-agent-id" }, error: null }),
      }),
    }),
  }),
} as any;

function createBrandAgent(): BrandAgent {
  return new BrandAgent(mockConfig, mockLogger, mockSupabase, mockManifest);
}

function makeReviewRequest(overrides?: Partial<ReviewRequest>): ReviewRequest {
  return {
    taskId: "task-123",
    agentSlug: "content",
    content: "Test content for review",
    taskType: "blog_post",
    ...overrides,
  };
}

describe("BrandAgent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("approval flow", () => {
    it("approves content that passes brand review", async () => {
      mockRouteRequest.mockResolvedValueOnce({
        text: "",
        model: "claude-opus-4-6",
        tokensIn: 500,
        tokensOut: 50,
        durationMs: 1200,
        costUsd: 0.01,
        toolUse: {
          toolName: "brand_review_decision",
          input: { decision: "approved", feedback: "Bra tonalitet och tydlig poäng." },
        },
      });

      const agent = createBrandAgent();
      const result = await agent.review(makeReviewRequest());

      expect(result.decision).toBe("approved");
      expect(result.escalated).toBe(false);
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(mockSupabase, "task-123", "approved");
      expect(mockCreateApproval).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({ decision: "approved" }));
    });
  });

  describe("rejection flow", () => {
    it("rejects content that fails brand review", async () => {
      mockRouteRequest.mockResolvedValueOnce({
        text: "",
        model: "claude-opus-4-6",
        tokensIn: 500,
        tokensOut: 80,
        durationMs: 1500,
        costUsd: 0.01,
        toolUse: {
          toolName: "brand_review_decision",
          input: { decision: "rejected", feedback: "Passivt språk. Saknar tydlig poäng." },
        },
      });

      const agent = createBrandAgent();
      const result = await agent.review(makeReviewRequest());

      expect(result.decision).toBe("rejected");
      expect(result.escalated).toBe(false);
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(mockSupabase, "task-123", "rejected");
    });
  });

  describe("escalation flow", () => {
    it("escalates after 3 consecutive rejections", async () => {
      const rejectionResponse = {
        text: "",
        model: "claude-opus-4-6",
        tokensIn: 500,
        tokensOut: 50,
        durationMs: 1000,
        costUsd: 0.01,
        toolUse: {
          toolName: "brand_review_decision",
          input: { decision: "rejected", feedback: "Otydlig tonalitet." },
        },
      };

      mockRouteRequest
        .mockResolvedValueOnce(rejectionResponse)
        .mockResolvedValueOnce(rejectionResponse)
        .mockResolvedValueOnce(rejectionResponse);

      const agent = createBrandAgent();
      const request = makeReviewRequest({ taskId: "task-escalate" });

      // First two rejections: no escalation
      const r1 = await agent.review(request);
      expect(r1.escalated).toBe(false);

      const r2 = await agent.review(request);
      expect(r2.escalated).toBe(false);

      // Third rejection: should escalate
      const r3 = await agent.review(request);
      expect(r3.escalated).toBe(true);
      expect(r3.decision).toBe("rejected");
    });

    it("resets rejection count after approval", async () => {
      mockRouteRequest
        .mockResolvedValueOnce({
          text: "",
          model: "claude-opus-4-6",
          tokensIn: 500,
          tokensOut: 50,
          durationMs: 1000,
          costUsd: 0.01,
          toolUse: { toolName: "brand_review_decision", input: { decision: "rejected", feedback: "Fel ton." } },
        })
        .mockResolvedValueOnce({
          text: "",
          model: "claude-opus-4-6",
          tokensIn: 500,
          tokensOut: 50,
          durationMs: 1000,
          costUsd: 0.01,
          toolUse: { toolName: "brand_review_decision", input: { decision: "approved", feedback: "Bra!" } },
        })
        .mockResolvedValueOnce({
          text: "",
          model: "claude-opus-4-6",
          tokensIn: 500,
          tokensOut: 50,
          durationMs: 1000,
          costUsd: 0.01,
          toolUse: { toolName: "brand_review_decision", input: { decision: "rejected", feedback: "Fel ton igen." } },
        });

      const agent = createBrandAgent();
      const request = makeReviewRequest({ taskId: "task-reset" });

      await agent.review(request); // reject #1
      await agent.review(request); // approve → resets count
      const r3 = await agent.review(request); // reject #1 again (not #2)

      expect(r3.escalated).toBe(false);
    });
  });

  describe("stale entry cleanup (B2)", () => {
    it("cleans up rejection entries older than 24h", async () => {
      const rejectionResponse = {
        text: "",
        model: "claude-opus-4-6",
        tokensIn: 500,
        tokensOut: 50,
        durationMs: 1000,
        costUsd: 0.01,
        toolUse: {
          toolName: "brand_review_decision",
          input: { decision: "rejected", feedback: "Otydlig ton." },
        },
      };

      // Reject twice for task-stale (count = 2)
      mockRouteRequest.mockResolvedValueOnce(rejectionResponse).mockResolvedValueOnce(rejectionResponse);

      const agent = createBrandAgent();
      await agent.review(makeReviewRequest({ taskId: "task-stale" }));
      await agent.review(makeReviewRequest({ taskId: "task-stale" }));

      // Fast-forward time by 25 hours to make entries stale
      const realNow = Date.now;
      Date.now = () => realNow() + 25 * 60 * 60 * 1000;

      // Next rejection should be count=1 (stale entry cleaned), not count=3 (escalation)
      mockRouteRequest.mockResolvedValueOnce(rejectionResponse);
      const result = await agent.review(makeReviewRequest({ taskId: "task-stale" }));

      Date.now = realNow;

      expect(result.escalated).toBe(false);
      // Count was reset by cleanup, so this is rejection #1, not #3
    });
  });

  describe("fallback parsing", () => {
    it("handles text-only LLM response (no tool use) as revision_requested", async () => {
      mockRouteRequest.mockResolvedValueOnce({
        text: "This is not JSON. The content needs revision because it lacks clarity.",
        model: "claude-opus-4-6",
        tokensIn: 500,
        tokensOut: 50,
        durationMs: 1000,
        costUsd: 0.01,
      });

      const agent = createBrandAgent();
      const result = await agent.review(makeReviewRequest());

      expect(result.decision).toBe("revision_requested");
      expect(result.feedback).toContain("needs revision");
    });
  });
});
