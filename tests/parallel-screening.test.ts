import { isHighRiskContent } from "../src/agents/brand/quick-screen";

jest.mock("../src/gateway/router", () => ({
  routeRequest: jest.fn(),
}));

import { routeRequest } from "../src/gateway/router";
import { quickBrandScreen } from "../src/agents/brand/quick-screen";
import { AppConfig } from "../src/utils/config";
import { Logger } from "../src/gateway/logger";

const mockRouteRequest = routeRequest as jest.MockedFunction<typeof routeRequest>;

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

describe("isHighRiskContent", () => {
  it("flags case_study as high risk", () => {
    expect(isHighRiskContent("case_study", 0.2)).toBe(true);
  });

  it("flags whitepaper as high risk", () => {
    expect(isHighRiskContent("whitepaper", 0.2)).toBe(true);
  });

  it("flags newsletter as high risk", () => {
    expect(isHighRiskContent("newsletter", 0.2)).toBe(true);
  });

  it("flags press_release as high risk", () => {
    expect(isHighRiskContent("press_release", 0.2)).toBe(true);
  });

  it("flags content with sample_review_rate >= 1.0 as high risk", () => {
    expect(isHighRiskContent("blog_post", 1.0)).toBe(true);
  });

  it("does not flag blog_post with low review rate", () => {
    expect(isHighRiskContent("blog_post", 0.2)).toBe(false);
  });

  it("does not flag linkedin with low review rate", () => {
    expect(isHighRiskContent("linkedin", 0.0)).toBe(false);
  });
});

describe("quickBrandScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns not flagged when screening passes", async () => {
    mockRouteRequest.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 100,
      tokensOut: 30,
      durationMs: 500,
      costUsd: 0.0005,
      toolUse: {
        toolName: "quick_screen_response",
        input: { flagged: false, issues: [] },
      },
    });

    const result = await quickBrandScreen(mockConfig, mockLogger, "Test content", "blog_post");
    expect(result.flagged).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it("returns flagged with issues when screening finds problems", async () => {
    mockRouteRequest.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 600,
      costUsd: 0.0005,
      toolUse: {
        toolName: "quick_screen_response",
        input: {
          flagged: true,
          issues: ["Passivt språk i inledningen", "Saknar Forefront-tonalitet"],
        },
      },
    });

    const result = await quickBrandScreen(mockConfig, mockLogger, "Test content", "case_study");
    expect(result.flagged).toBe(true);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toContain("Passivt språk");
  });

  it("returns not flagged when no tool_use in response (fallback)", async () => {
    mockRouteRequest.mockResolvedValueOnce({
      text: "Looks fine to me",
      model: "claude-sonnet-4-6",
      tokensIn: 100,
      tokensOut: 20,
      durationMs: 400,
      costUsd: 0.0005,
    });

    const result = await quickBrandScreen(mockConfig, mockLogger, "Test content", "blog_post");
    expect(result.flagged).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it("uses claude-sonnet for screening", async () => {
    mockRouteRequest.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 100,
      tokensOut: 30,
      durationMs: 500,
      costUsd: 0.0005,
      toolUse: {
        toolName: "quick_screen_response",
        input: { flagged: false, issues: [] },
      },
    });

    await quickBrandScreen(mockConfig, mockLogger, "Test", "blog_post");

    const routingArg = mockRouteRequest.mock.calls[0][2];
    expect(routingArg.default).toBe("claude-sonnet");
  });
});
