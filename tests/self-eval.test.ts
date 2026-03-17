import { parseSelfEvalResponse } from "../src/agents/self-eval";

jest.mock("../src/gateway/router", () => ({
  routeRequest: jest.fn(),
}));

import { routeRequest } from "../src/gateway/router";
const mockRouteRequest = routeRequest as jest.MockedFunction<typeof routeRequest>;

import { runSelfEval } from "../src/agents/self-eval";
import { AppConfig } from "../src/utils/config";
import { Logger } from "../src/gateway/logger";
import { SelfEvalConfig } from "../src/llm/types";

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

const selfEvalConfig: SelfEvalConfig = {
  enabled: true,
  model: "claude-sonnet",
  criteria: [
    "Följer texten tonalitetsreglerna?",
    "Passar längd och format för målkanalen?",
  ],
  threshold: 0.7,
};

describe("parseSelfEvalResponse", () => {
  it("parses tool_use response correctly", () => {
    const result = parseSelfEvalResponse({
      text: "",
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: true, score: 0.85, issues: [] },
      },
    });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.85);
    expect(result.issues).toEqual([]);
  });

  it("parses tool_use with issues", () => {
    const result = parseSelfEvalResponse({
      text: "",
      toolUse: {
        toolName: "self_eval_response",
        input: {
          pass: false,
          score: 0.45,
          issues: ["Passivt språk i stycke 2", "Saknar CTA"],
        },
      },
    });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.45);
    expect(result.issues).toHaveLength(2);
  });

  it("clamps score to 0-1 range", () => {
    const result = parseSelfEvalResponse({
      text: "",
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: true, score: 1.5, issues: [] },
      },
    });
    expect(result.score).toBe(1.0);
  });

  it("falls back to JSON parsing from text when no tool_use", () => {
    const result = parseSelfEvalResponse({
      text: '{"pass": false, "score": 0.3, "issues": ["Problem"]}',
    });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.3);
    expect(result.issues).toEqual(["Problem"]);
  });

  it("returns default pass when text is unparseable", () => {
    const result = parseSelfEvalResponse({
      text: "Some random text without JSON",
    });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.5);
  });
});

describe("runSelfEval", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runs self-eval and returns result", async () => {
    mockRouteRequest.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 50,
      durationMs: 800,
      costUsd: 0.001,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: true, score: 0.9, issues: [] },
      },
    });

    const result = await runSelfEval(
      mockConfig,
      mockLogger,
      "content",
      "Test output text",
      selfEvalConfig
    );

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.9);
    expect(mockRouteRequest).toHaveBeenCalledTimes(1);

    // Verify it uses the configured model
    const callArgs = mockRouteRequest.mock.calls[0];
    const routing = callArgs[2];
    expect(routing.default).toBe("claude-sonnet");
  });

  it("uses the correct model from config", async () => {
    mockRouteRequest.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 50,
      durationMs: 800,
      costUsd: 0.001,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: true, score: 0.8, issues: [] },
      },
    });

    await runSelfEval(mockConfig, mockLogger, "content", "Test", selfEvalConfig);

    const routingArg = mockRouteRequest.mock.calls[0][2];
    expect(routingArg.default).toBe("claude-sonnet");
  });

  it("includes criteria in the eval prompt", async () => {
    mockRouteRequest.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 50,
      durationMs: 800,
      costUsd: 0.001,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: true, score: 0.9, issues: [] },
      },
    });

    await runSelfEval(mockConfig, mockLogger, "content", "Test", selfEvalConfig);

    const request = mockRouteRequest.mock.calls[0][4];
    expect(request.userPrompt).toContain("tonalitetsreglerna");
    expect(request.userPrompt).toContain("målkanalen");
  });

  it("uses tool_use for structured output", async () => {
    mockRouteRequest.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 50,
      durationMs: 800,
      costUsd: 0.001,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: false, score: 0.5, issues: ["Issue 1"] },
      },
    });

    await runSelfEval(mockConfig, mockLogger, "content", "Test", selfEvalConfig);

    const request = mockRouteRequest.mock.calls[0][4];
    expect(request.tools).toBeDefined();
    expect(request.tools![0].name).toBe("self_eval_response");
    expect(request.toolChoice).toEqual({ type: "tool", name: "self_eval_response" });
  });
});
