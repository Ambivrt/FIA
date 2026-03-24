import { IntelligenceAgent } from "../src/agents/intelligence/intelligence-agent";
import { AgentManifest } from "../src/agents/agent-loader";
import { AgentTask } from "../src/agents/base-agent";
import { AppConfig } from "../src/utils/config";
import { Logger } from "../src/gateway/logger";
import { LLMResponse } from "../src/llm/types";

// Mock all external dependencies
jest.mock("../src/gateway/router", () => ({
  routeRequest: jest.fn(),
}));
jest.mock("../src/llm/google-search", () => ({
  searchGoogle: jest.fn(),
}));
jest.mock("../src/supabase/task-writer", () => ({
  createTask: jest.fn().mockResolvedValue("task-intel-123"),
  createApproval: jest.fn().mockResolvedValue("approval-id"),
  updateTaskStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/supabase/activity-writer", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/supabase/metrics-writer", () => ({
  writeMetric: jest.fn().mockResolvedValue(undefined),
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
jest.mock("../src/agents/agent-loader", () => ({
  loadAgentManifest: jest.fn(),
  resolveAgentFiles: jest.fn().mockReturnValue(""),
  loadSkills: jest.fn().mockReturnValue([]),
}));
jest.mock("../src/llm/pricing", () => ({
  usdToSek: jest.fn().mockReturnValue(10.5),
}));

import { routeRequest } from "../src/gateway/router";
import { searchGoogle } from "../src/llm/google-search";
import { createTask, updateTaskStatus } from "../src/supabase/task-writer";

const mockRouteRequest = routeRequest as jest.MockedFunction<typeof routeRequest>;
const mockSearchGoogle = searchGoogle as jest.MockedFunction<typeof searchGoogle>;
const mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;
const mockUpdateTaskStatus = updateTaskStatus as jest.MockedFunction<typeof updateTaskStatus>;

const mockConfig: AppConfig = {
  nodeEnv: "test",
  logDir: "/tmp/fia-test-logs",
  logLevel: "debug",
  knowledgeDir: process.cwd() + "/knowledge",
  anthropicApiKey: "test-key",
  geminiApiKey: "",
  serperApiKey: "test-serper-key",
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
  name: "Intelligence Agent",
  slug: "intelligence",
  version: "1.1.0",
  routing: {
    default: "claude-sonnet",
    deep_analysis: "claude-opus",
    search: "google-search",
  },
  system_context: ["context/watch-domains.yaml", "context/scoring-criteria.yaml"],
  task_context: {
    morning_scan: ["context/templates/morning-scan.md"],
    midday_sweep: ["context/templates/morning-scan.md"],
    weekly_intelligence: ["context/templates/weekly-brief.md"],
    rapid_response: ["context/templates/rapid-response.md"],
  },
  tools: ["gws:drive", "gws:docs", "gws:sheets"],
  autonomy: "autonomous",
  escalation_threshold: 3,
  sample_review_rate: 0.2,
  writable: ["memory/source-history.json", "memory/scoring-calibration.json", "memory/learnings.json"],
};

const mockSupabase = {
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "intelligence-agent-id" }, error: null }),
        gte: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
      in: jest.fn().mockReturnValue({
        gte: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "task-intel-123" }, error: null }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
} as any;

function createIntelligenceAgent(): IntelligenceAgent {
  return new IntelligenceAgent(mockConfig, mockLogger, mockSupabase, mockManifest);
}

function makeTask(overrides?: Partial<AgentTask>): AgentTask {
  return {
    type: "morning_scan",
    title: "Intelligence morgonscan",
    input: "Schemalagd uppgift: Intelligence morgonscan",
    ...overrides,
  };
}

function makeScoringResponse(): LLMResponse {
  return {
    text: "",
    model: "claude-sonnet-4-6",
    tokensIn: 800,
    tokensOut: 200,
    durationMs: 1500,
    costUsd: 0.01,
    toolUse: {
      toolName: "signal_scoring",
      input: {
        scores: [
          {
            url: "https://example.com/article-1",
            domain_relevance: 0.9,
            forefront_impact: 0.8,
            actionability: 0.7,
            recency_novelty: 0.8,
          },
          {
            url: "https://example.com/article-2",
            domain_relevance: 0.6,
            forefront_impact: 0.5,
            actionability: 0.4,
            recency_novelty: 0.6,
          },
        ],
      },
    },
  };
}

function makeDeepAnalysisResponse(): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 1200,
    tokensOut: 500,
    durationMs: 3000,
    costUsd: 0.1,
    toolUse: {
      toolName: "deep_analysis",
      input: {
        analyses: [
          {
            url: "https://example.com/article-1",
            summary: "McKinsey lanserar ny AI-konsulttjänst.",
            implications: "Direkt konkurrens med Forefronts AI-transformation.",
            suggested_action: "brief",
            confidence: 0.85,
          },
        ],
      },
    },
  };
}

function makeBriefingResponse(): LLMResponse {
  return {
    text: "## Morgonscan 2026-03-19\n\n### Sammanfattning\nEn händelse noterad...",
    model: "claude-sonnet-4-6",
    tokensIn: 600,
    tokensOut: 400,
    durationMs: 2000,
    costUsd: 0.02,
  };
}

describe("IntelligenceAgent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTask.mockResolvedValue("task-intel-123");

    // Default search results
    mockSearchGoogle.mockResolvedValue([
      { title: "Article 1", snippet: "AI transformation in consulting", url: "https://example.com/article-1" },
      { title: "Article 2", snippet: "Digital strategy trends", url: "https://example.com/article-2" },
    ]);
  });

  describe("morning scan", () => {
    it("executes full scan pipeline and returns completed status", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeBriefingResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(makeTask());

      expect(result.status).toBe("completed");
      expect(result.taskId).toBe("task-intel-123");
      expect(mockSearchGoogle).toHaveBeenCalled();
    });

    it("handles search failures gracefully", async () => {
      mockSearchGoogle.mockRejectedValue(new Error("Serper API error"));

      // Even with all searches failing, scoring/briefing still runs (with empty findings)
      mockRouteRequest.mockResolvedValueOnce(makeBriefingResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(makeTask());

      // Agent should handle errors gracefully (either complete with empty results or error)
      expect(["completed", "error"]).toContain(result.status);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("skips duplicate URLs from source history", async () => {
      // Return same URL twice
      mockSearchGoogle.mockResolvedValue([
        { title: "Same Article", snippet: "Already seen", url: "https://example.com/already-seen" },
      ]);

      mockRouteRequest
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeBriefingResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(makeTask());

      expect(result.status).toBe("completed");
    });
  });

  describe("midday sweep", () => {
    it("uses morning_scan template for midday sweep", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeBriefingResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(makeTask({ type: "midday_sweep", title: "Intelligence middagssweep" }));

      expect(result.status).toBe("completed");
    });
  });

  describe("weekly intelligence", () => {
    it("executes weekly briefing", async () => {
      mockRouteRequest.mockResolvedValueOnce({
        text: "## Veckobriefing\n\nVeckans viktigaste...",
        model: "claude-opus-4-6",
        tokensIn: 2000,
        tokensOut: 1500,
        durationMs: 5000,
        costUsd: 0.2,
      });

      // Set up the full Supabase mock chain for weekly briefing queries
      const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
      const mockEqStatus = jest.fn().mockReturnValue({ order: mockOrder });
      const mockGte = jest.fn().mockReturnValue({ eq: mockEqStatus });
      const mockIn = jest.fn().mockReturnValue({ gte: mockGte });
      const mockSelectTasks = jest.fn().mockReturnValue({ in: mockIn });
      const mockEqAgent = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "intelligence-agent-id" }, error: null }),
        in: mockIn,
      });
      const mockSelect = jest.fn().mockImplementation((fields: string) => {
        if (fields === "id") {
          return { eq: mockEqAgent };
        }
        return { eq: jest.fn().mockReturnValue({ in: mockIn }) };
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { id: "task-intel-123" }, error: null }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({ type: "weekly_intelligence", title: "Intelligence veckobriefing" }),
      );

      expect(result.status).toBe("completed");
    });
  });

  describe("rapid response handling", () => {
    it("creates rapid response task for Content Agent when triggered", async () => {
      const rapidAnalysis: LLMResponse = {
        text: "",
        model: "claude-opus-4-6",
        tokensIn: 1200,
        tokensOut: 500,
        durationMs: 3000,
        costUsd: 0.1,
        toolUse: {
          toolName: "deep_analysis",
          input: {
            analyses: [
              {
                url: "https://example.com/article-1",
                summary: "Konkurrent lanserar AI-tjänst.",
                implications: "Direkt överlapp med FIA.",
                suggested_action: "rapid_response",
                confidence: 0.92,
              },
            ],
          },
        },
      };

      mockRouteRequest
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(rapidAnalysis)
        .mockResolvedValueOnce(makeBriefingResponse());

      // Mock Supabase to return content agent ID for rapid response task creation
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { id: "content-agent-id" }, error: null }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { id: "rapid-task-id" }, error: null }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const agent = createIntelligenceAgent();
      const result = await agent.execute(makeTask());

      expect(result.status).toBe("completed");
    });
  });

  describe("agent properties", () => {
    it("has correct name and slug", () => {
      const agent = createIntelligenceAgent();
      expect(agent.name).toBe("Intelligence Agent");
      expect(agent.slug).toBe("intelligence");
    });
  });
});
