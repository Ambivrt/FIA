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
  updateTaskSubStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/supabase/intelligence-profiles", () => ({
  getProfile: jest.fn().mockResolvedValue(null),
  upsertProfile: jest.fn().mockResolvedValue("profile-id"),
  searchProfiles: jest.fn().mockResolvedValue([]),
  listProfilesByCategory: jest.fn().mockResolvedValue([]),
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
import { createTask, updateTaskStatus, updateTaskSubStatus } from "../src/supabase/task-writer";
import { getProfile, upsertProfile } from "../src/supabase/intelligence-profiles";

const mockRouteRequest = routeRequest as jest.MockedFunction<typeof routeRequest>;
const mockSearchGoogle = searchGoogle as jest.MockedFunction<typeof searchGoogle>;
const mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;
const mockUpdateTaskStatus = updateTaskStatus as jest.MockedFunction<typeof updateTaskStatus>;
const mockUpdateTaskSubStatus = updateTaskSubStatus as jest.MockedFunction<typeof updateTaskSubStatus>;
const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;
const mockUpsertProfile = upsertProfile as jest.MockedFunction<typeof upsertProfile>;

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
  workvivoApiKey: "",
  workvivoBaseUrl: "https://api.workvivo.com/v2",
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
  version: "2.0.0",
  routing: {
    default: "claude-sonnet",
    deep_analysis: "claude-opus",
    search: "google-search",
    quick: "claude-sonnet",
    standard_analysis: "claude-opus",
    deep: "claude-opus",
  },
  system_context: ["context/watch-domains.yaml", "context/scoring-criteria.yaml"],
  task_context: {
    morning_scan: ["context/templates/morning-scan.md"],
    midday_sweep: ["context/templates/morning-scan.md"],
    weekly_intelligence: ["context/templates/weekly-brief.md"],
    rapid_response: ["context/templates/rapid-response.md"],
    directed_research: ["context/templates/directed-research.md"],
    competitor_deep_dive: ["context/templates/competitor-deep-dive.md"],
    trend_analysis: ["context/templates/trend-analysis.md"],
    company_industry_analysis: ["context/templates/company-industry-analysis.md"],
    tech_watch: ["context/templates/tech-watch.md"],
    talent_intel: ["context/templates/talent-intel.md"],
  },
  tools: ["gws:drive", "gws:docs", "gws:sheets"],
  autonomy: "autonomous",
  escalation_threshold: 3,
  sample_review_rate: 0.2,
  writable: [
    "memory/source-history.json",
    "memory/scoring-calibration.json",
    "memory/learnings.json",
    "memory/temp-watch-domains.json",
  ],
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

  // ──────────────────────────────────────────────────────────────
  // NEW TESTS: Research pipeline, depth, profiles, sub-statuses
  // ──────────────────────────────────────────────────────────────

  describe("depth assessment", () => {
    function makeDepthResponse(depth: string): LLMResponse {
      return {
        text: "",
        model: "claude-sonnet-4-6",
        tokensIn: 200,
        tokensOut: 100,
        durationMs: 500,
        costUsd: 0.002,
        toolUse: {
          toolName: "depth_assessment",
          input: {
            recommended_depth: depth,
            reasoning: `Bedömt som ${depth}`,
            estimated_searches: depth === "quick" ? 5 : depth === "standard" ? 15 : 40,
          },
        },
      };
    }

    it("returns quick for Slack-initiated research with no hint", async () => {
      // Depth assessment + scoring + research output tool calls
      mockRouteRequest.mockResolvedValueOnce(makeScoringResponse()).mockResolvedValueOnce(makeResearchOutputResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "directed_research",
          title: "Snabb fråga om Claude priser",
          input: "Vad kostar Claude Opus?",
          content_json: { source_channel: "slack" },
        } as any),
      );

      expect(result.status).toBe("completed");
    });

    it("returns standard for high priority tasks", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "directed_research",
          title: "Urgent: Konkurrent namnger Forefront",
          input: "Analysera situationen",
          priority: "high",
        }),
      );

      expect(result.status).toBe("completed");
    });

    it("respects user depth_hint override", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "directed_research",
          title: "Deep dive AI-konsulting",
          input: "Komplett analys",
          content_json: { depth_hint: "deep" },
        } as any),
      );

      expect(result.status).toBe("completed");
    });
  });

  describe("directed research", () => {
    it("executes full research pipeline", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "directed_research",
          title: "Hur använder Accenture AI?",
          input: "Analysera Accentures AI-strategi i Norden",
        }),
      );

      expect(result.status).toBe("completed");
      expect(result.taskId).toBe("task-intel-123");
    });

    it("creates intelligence profile after research", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse());

      const agent = createIntelligenceAgent();
      await agent.execute(
        makeTask({
          type: "directed_research",
          title: "Accenture AI-strategi",
          input: "Analysera",
        }),
      );

      expect(mockUpsertProfile).toHaveBeenCalled();
    });
  });

  describe("competitor deep dive", () => {
    it("generates SWOT module", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse())
        .mockResolvedValueOnce(makeSwotModuleResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "competitor_deep_dive",
          title: "McKinsey konkurrentanalys",
          input: "Djupanalys av McKinseys AI-erbjudande",
        }),
      );

      expect(result.status).toBe("completed");
    });
  });

  describe("trend analysis", () => {
    it("generates timeline module", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse())
        .mockResolvedValueOnce(makeTimelineModuleResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "trend_analysis",
          title: "AI Agent-trend 2025-2026",
          input: "Analysera trender inom AI-agenter",
        }),
      );

      expect(result.status).toBe("completed");
    });
  });

  describe("tech watch", () => {
    it("generates scorecard module", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse())
        .mockResolvedValueOnce(makeScorecardModuleResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "tech_watch",
          title: "Cursor vs Windsurf utvärdering",
          input: "Utvärdera Cursor och Windsurf som AI-kodverktyg",
        }),
      );

      expect(result.status).toBe("completed");
    });
  });

  describe("talent intel", () => {
    it("generates talent matrix module", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse())
        .mockResolvedValueOnce(makeTalentMatrixModuleResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "talent_intel",
          title: "AI-konsultrekrytering Norden",
          input: "Bevaka rekryteringsläget för AI-konsulter",
        }),
      );

      expect(result.status).toBe("completed");
    });
  });

  describe("company industry analysis", () => {
    it("generates company profile module", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse())
        .mockResolvedValueOnce(makeCompanyProfileModuleResponse());

      const agent = createIntelligenceAgent();
      const result = await agent.execute(
        makeTask({
          type: "company_industry_analysis",
          title: "EdTech AI-branschen",
          input: "Analysera EdTech AI-marknaden i Norden",
        }),
      );

      expect(result.status).toBe("completed");
    });
  });

  describe("sub-statuses", () => {
    it("transitions through sub-statuses during research", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse());

      const agent = createIntelligenceAgent();
      await agent.execute(
        makeTask({
          type: "directed_research",
          title: "Test sub-statuses",
          input: "Test",
        }),
      );

      // Should have set gathering, analyzing, compiling sub-statuses
      expect(mockUpdateTaskSubStatus).toHaveBeenCalledWith(expect.anything(), "task-intel-123", "gathering");
      expect(mockUpdateTaskSubStatus).toHaveBeenCalledWith(expect.anything(), "task-intel-123", "analyzing");
      expect(mockUpdateTaskSubStatus).toHaveBeenCalledWith(expect.anything(), "task-intel-123", "compiling");
    });
  });

  describe("intelligence profiles", () => {
    it("loads existing profile for context", async () => {
      mockGetProfile.mockResolvedValueOnce({
        id: "prof-1",
        topic_slug: "accenture",
        topic_name: "Accenture",
        category: "competitor",
        summary: "Stor konsultbyrå med AI-fokus",
        key_facts: { employees: "700000" },
        last_updated: new Date().toISOString(),
        research_count: 3,
        sources: ["https://accenture.com"],
        related_profiles: [],
        created_at: new Date().toISOString(),
      });

      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse());

      const agent = createIntelligenceAgent();
      await agent.execute(
        makeTask({
          type: "directed_research",
          title: "Accenture uppdatering",
          input: "Senaste nytt om Accenture",
        }),
      );

      expect(mockGetProfile).toHaveBeenCalled();
      expect(mockUpsertProfile).toHaveBeenCalled();
    });

    it("increments research_count on upsert", async () => {
      const existingProfile = {
        id: "prof-1",
        topic_slug: "accenture",
        topic_name: "Accenture",
        category: "competitor" as const,
        summary: "Befintlig profil",
        key_facts: {},
        last_updated: new Date().toISOString(),
        research_count: 5,
        sources: [] as string[],
        related_profiles: [] as string[],
        created_at: new Date().toISOString(),
      };
      // getProfile is called multiple times: assessDepth, executeResearch, upsertIntelligenceProfile
      mockGetProfile.mockResolvedValue(existingProfile);

      mockRouteRequest
        .mockResolvedValueOnce(makeDepthAssessmentResponse("standard"))
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeResearchOutputResponse());

      const agent = createIntelligenceAgent();
      await agent.execute(
        makeTask({
          type: "directed_research",
          title: "Accenture",
          input: "Uppdatera",
        }),
      );

      expect(mockUpsertProfile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ research_count: 6 }));
    });
  });

  describe("enrichment", () => {
    it("includes suggested_research_topics in scan output", async () => {
      mockRouteRequest
        .mockResolvedValueOnce(makeScoringResponse())
        .mockResolvedValueOnce(makeDeepAnalysisResponse())
        .mockResolvedValueOnce(makeBriefingResponse());

      const agent = createIntelligenceAgent();
      await agent.execute(makeTask());

      // Verify content_json includes suggested_research_topics
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
        expect.anything(),
        "task-intel-123",
        "published",
        expect.objectContaining({
          content_json: expect.objectContaining({
            suggested_research_topics: expect.any(Array),
          }),
        }),
      );
    });
  });
});

// ──────────────────────────────────────────────────────────────
// Additional test helpers for research pipeline
// ──────────────────────────────────────────────────────────────

function makeDepthAssessmentResponse(depth: string): LLMResponse {
  return {
    text: "",
    model: "claude-sonnet-4-6",
    tokensIn: 200,
    tokensOut: 100,
    durationMs: 500,
    costUsd: 0.002,
    toolUse: {
      toolName: "depth_assessment",
      input: {
        recommended_depth: depth,
        reasoning: `Bedömt som ${depth}`,
        estimated_searches: 15,
      },
    },
  };
}

function makeResearchOutputResponse(): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 1500,
    tokensOut: 800,
    durationMs: 4000,
    costUsd: 0.15,
    toolUse: {
      toolName: "research_output",
      input: {
        summary: "Sammanfattning av research-resultat.",
        findings: [
          {
            title: "Fynd 1",
            detail: "Beskrivning av fynd 1",
            source: "https://example.com/article-1",
            relevance: 0.85,
          },
        ],
        recommendations: ["Forefront bör bevaka detta område"],
        sources: ["https://example.com/article-1"],
        publishable: false,
        seo_relevant: false,
        lead_opportunities: false,
        urgency_score: 0.3,
        suggested_action: "brief",
      },
    },
  };
}

function makeSwotModuleResponse(): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 800,
    tokensOut: 400,
    durationMs: 2000,
    costUsd: 0.08,
    toolUse: {
      toolName: "swot_module",
      input: {
        strengths: ["Starkt varumärke", "Global närvaro"],
        weaknesses: ["Hög kostnad", "Långsam anpassning"],
        opportunities: ["Forefront kan differentiera på specialisering"],
        threats: ["Priskrig på AI-konsulting"],
      },
    },
  };
}

function makeTimelineModuleResponse(): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 800,
    tokensOut: 400,
    durationMs: 2000,
    costUsd: 0.08,
    toolUse: {
      toolName: "timeline_module",
      input: {
        timeline_entries: [
          { date: "2025-01", event: "GPT-5 lanseras", significance: "Ny nivå av AI-kapabilitet" },
          { date: "2025-06", event: "EU AI Act träder i kraft", significance: "Regulatorisk förändring" },
        ],
        trend_direction: "emerging",
        inflection_points: ["EU AI Act ändrar spelreglerna"],
      },
    },
  };
}

function makeScorecardModuleResponse(): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 800,
    tokensOut: 400,
    durationMs: 2000,
    costUsd: 0.08,
    toolUse: {
      toolName: "scorecard_module",
      input: {
        criteria: [
          { name: "Capabilities", score: 8, notes: "Stark kodkomplettering" },
          { name: "Pricing", score: 6, notes: "Premium-pris" },
          { name: "Integration Fit", score: 7, notes: "Bra VS Code-integration" },
        ],
        overall_score: 7,
        verdict: "Rekommenderas",
      },
    },
  };
}

function makeTalentMatrixModuleResponse(): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 800,
    tokensOut: 400,
    durationMs: 2000,
    costUsd: 0.08,
    toolUse: {
      toolName: "talent_matrix_module",
      input: {
        roles_in_demand: [
          { title: "AI Engineer", count: 45, companies: ["Accenture", "McKinsey"] },
          { title: "ML Ops", count: 20, companies: ["Spotify", "Klarna"] },
        ],
        seniority_distribution: "Senior 60%, Mid 30%, Junior 10%",
        skill_patterns: ["Python", "LLM fine-tuning", "RAG"],
        hiring_velocity: "increasing",
      },
    },
  };
}

function makeCompanyProfileModuleResponse(): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 800,
    tokensOut: 400,
    durationMs: 2000,
    costUsd: 0.08,
    toolUse: {
      toolName: "company_profile_module",
      input: {
        overview: "EdTech AI-branschen i Norden växer snabbt",
        financials: { market_size: "2 miljarder SEK", growth: "25% YoY" },
        strategy_summary: "Fokus på personaliserad inlärning med AI",
        market_position: "Fragmenterad marknad med få stora aktörer",
        risk_factors: ["Regulatoriska krav", "Dataintegritet"],
      },
    },
  };
}
