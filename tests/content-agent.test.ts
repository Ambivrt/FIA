import { ContentAgent } from "../src/agents/content/content-agent";
import { AgentManifest } from "../src/agents/agent-loader";
import { AgentTask } from "../src/agents/base-agent";
import { AppConfig } from "../src/utils/config";
import { Logger } from "../src/gateway/logger";
import { LLMResponse } from "../src/llm/types";

// Mock all external dependencies
jest.mock("../src/gateway/router", () => ({
  routeRequest: jest.fn(),
  routeImageRequest: jest.fn(),
}));
jest.mock("../src/supabase/task-writer", () => ({
  createTask: jest.fn().mockResolvedValue("task-123"),
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
  loadAgentManifest: jest.fn().mockReturnValue({
    name: "Brand Agent",
    slug: "brand",
    version: "1.0.0",
    routing: { default: "claude-opus" },
    system_context: [],
    task_context: {},
    tools: [],
    autonomy: "autonomous",
    escalation_threshold: 3,
    sample_review_rate: 0,
    writable: ["memory/rejection-patterns.json"],
  }),
  resolveAgentFiles: jest.fn().mockReturnValue(""),
  loadSkills: jest.fn().mockReturnValue([]),
}));
jest.mock("../src/llm/pricing", () => ({
  usdToSek: jest.fn().mockReturnValue(10.5),
}));

import { routeRequest, routeImageRequest } from "../src/gateway/router";
import { createTask, updateTaskStatus } from "../src/supabase/task-writer";

const mockRouteRequest = routeRequest as jest.MockedFunction<typeof routeRequest>;
const mockRouteImageRequest = routeImageRequest as jest.MockedFunction<typeof routeImageRequest>;
const mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;
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
  name: "Content Agent",
  slug: "content",
  version: "1.0.0",
  routing: { default: "claude-opus" },
  system_context: [],
  task_context: {},
  tools: [],
  autonomy: "autonomous",
  escalation_threshold: 3,
  sample_review_rate: 0.2,
  writable: ["memory/learnings.json"],
};

const mockSupabase = {
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "content-agent-id" }, error: null }),
      }),
    }),
  }),
} as any;

function createContentAgent(): ContentAgent {
  return new ContentAgent(mockConfig, mockLogger, mockSupabase, mockManifest);
}

function makeTask(overrides?: Partial<AgentTask>): AgentTask {
  return {
    type: "blog_post",
    title: "Test blog post",
    input: "Skriv en bloggpost om AI",
    ...overrides,
  };
}

function makeContentResponse(text: string): LLMResponse {
  return {
    text,
    model: "claude-opus-4-6",
    tokensIn: 500,
    tokensOut: 300,
    durationMs: 2000,
    costUsd: 0.05,
  };
}

function makeBrandApproval(): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 400,
    tokensOut: 50,
    durationMs: 1000,
    costUsd: 0.01,
    toolUse: {
      toolName: "brand_review_decision",
      input: { decision: "approved", feedback: "Bra tonalitet." },
    },
  };
}

function makeBrandRejection(feedback: string): LLMResponse {
  return {
    text: "",
    model: "claude-opus-4-6",
    tokensIn: 400,
    tokensOut: 80,
    durationMs: 1000,
    costUsd: 0.01,
    toolUse: {
      toolName: "brand_review_decision",
      input: { decision: "rejected", feedback },
    },
  };
}

describe("ContentAgent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTask.mockResolvedValue("task-123");
  });

  describe("brand review loop", () => {
    it("returns approved content on first attempt", async () => {
      // First call: content generation
      mockRouteRequest
        .mockResolvedValueOnce(makeContentResponse("En bra bloggpost om AI."))
        // Second call: brand review
        .mockResolvedValueOnce(makeBrandApproval());

      const agent = createContentAgent();
      const result = await agent.execute(makeTask());

      expect(result.status).toBe("completed");
      expect(result.output).toBe("En bra bloggpost om AI.");
    });

    it("re-generates after brand rejection then succeeds", async () => {
      mockRouteRequest
        // 1st: content generation
        .mockResolvedValueOnce(makeContentResponse("Första utkastet."))
        // 2nd: brand review → rejection
        .mockResolvedValueOnce(makeBrandRejection("Passivt språk."))
        // 3rd: re-generation with feedback
        .mockResolvedValueOnce(makeContentResponse("Förbättrat utkast."))
        // 4th: brand review → approval
        .mockResolvedValueOnce(makeBrandApproval());

      const agent = createContentAgent();
      const result = await agent.execute(makeTask());

      expect(result.output).toBe("Förbättrat utkast.");
      expect(result.status).toBe("completed");
    });

    it("escalates after max rejection attempts", async () => {
      mockRouteRequest
        // 1st: content generation
        .mockResolvedValueOnce(makeContentResponse("Utkast 1."))
        // 2nd: brand rejection #1
        .mockResolvedValueOnce(makeBrandRejection("Fel ton."))
        // 3rd: re-generation
        .mockResolvedValueOnce(makeContentResponse("Utkast 2."))
        // 4th: brand rejection #2
        .mockResolvedValueOnce(makeBrandRejection("Fortfarande fel ton."))
        // 5th: re-generation
        .mockResolvedValueOnce(makeContentResponse("Utkast 3."))
        // 6th: brand rejection #3 → escalation
        .mockResolvedValueOnce(makeBrandRejection("Tredje avslaget."));

      const agent = createContentAgent();
      const result = await agent.execute(makeTask());

      expect(result.status).toBe("escalated");
    });
  });

  describe("intent conflict detection", () => {
    it("detects intent conflict via tool use and escalates", async () => {
      mockRouteRequest
        // 1st: content generation
        .mockResolvedValueOnce(makeContentResponse("Originalt innehåll."))
        // 2nd: brand rejection
        .mockResolvedValueOnce(makeBrandRejection("Fel vinkel."))
        // 3rd: re-generation returns intent conflict via tool use
        .mockResolvedValueOnce({
          text: "",
          model: "claude-opus-4-6",
          tokensIn: 500,
          tokensOut: 100,
          durationMs: 1500,
          costUsd: 0.03,
          toolUse: {
            toolName: "content_response",
            input: {
              content: "",
              intent_conflict: true,
              conflict_description: "Begäran strider mot varumärkets värderingar.",
            },
          },
        });

      const agent = createContentAgent();
      const result = await agent.execute(makeTask());

      expect(result.status).toBe("escalated");
    });
  });

  describe("image generation", () => {
    it("generates image without brand review", async () => {
      mockRouteImageRequest.mockResolvedValueOnce({
        imageData: Buffer.from("fake-image-data"),
        mimeType: "image/png",
        model: "gemini-2.5-flash-image",
        durationMs: 3000,
        costUsd: 0.04,
      });

      const agent = createContentAgent();
      const result = await agent.execute(makeTask({ type: "images", title: "Test image", input: "A futuristic city" }));

      expect(result.status).toBe("completed");
      expect(result.model).toBe("gemini-2.5-flash-image");
      expect(mockRouteImageRequest).toHaveBeenCalled();
    });
  });
});
