/**
 * Content Agent integration test.
 *
 * Verifies the full pipeline: agent-loader → prompt-builder → router → LLM → self-eval → Supabase.
 */

// Mock external dependencies
jest.mock("../../src/llm/claude", () => ({
  callClaude: jest.fn(),
}));
jest.mock("../../src/llm/google-search", () => ({
  searchGoogle: jest.fn(),
}));
jest.mock("../../src/supabase/task-writer", () => ({
  createTask: jest.fn().mockResolvedValue("task-int-1"),
  updateTaskStatus: jest.fn().mockResolvedValue(undefined),
  createApproval: jest.fn().mockResolvedValue("approval-id"),
}));
jest.mock("../../src/supabase/activity-writer", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/supabase/metrics-writer", () => ({
  writeMetric: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/slack/app", () => ({
  getSlackApp: jest.fn().mockReturnValue(null),
}));
jest.mock("../../src/slack/handlers", () => ({
  sendEscalation: jest.fn().mockResolvedValue(undefined),
}));

import { callClaude } from "../../src/llm/claude";
import { loadAgentManifest } from "../../src/agents/agent-loader";
import { BaseAgent, AgentTask, AgentResult } from "../../src/agents/base-agent";
import { createTask, updateTaskStatus } from "../../src/supabase/task-writer";
import { logActivity } from "../../src/supabase/activity-writer";
import { routeRequest } from "../../src/gateway/router";
import { AppConfig } from "../../src/utils/config";
import { Logger } from "../../src/gateway/logger";

const mockCallClaude = callClaude as jest.MockedFunction<typeof callClaude>;
const mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;
const mockUpdateTaskStatus = updateTaskStatus as jest.MockedFunction<typeof updateTaskStatus>;
const mockLogActivity = logActivity as jest.MockedFunction<typeof logActivity>;

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

const mockSupabase = {
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "content-agent-id" }, error: null }),
      }),
    }),
  }),
} as any;

// --- Manifest integration tests ---

describe("Content Agent – integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTask.mockResolvedValue("task-int-1");
  });

  it("agent-loader correctly parses content agent.yaml", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");

    expect(manifest.name).toBe("Content Agent");
    expect(manifest.slug).toBe("content");
    expect(manifest.routing.default).toBe("claude-opus");
    expect(manifest.routing.metadata).toBe("claude-sonnet");
    expect(manifest.routing.images).toBe("nano-banana-2");
    expect(manifest.self_eval).toBeDefined();
    expect(manifest.self_eval!.enabled).toBe(true);
    expect(manifest.self_eval!.model).toBe("claude-sonnet");
    expect(manifest.max_iterations).toBe(5);
  });

  it("blog_post routes to claude-opus via routing config", async () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");

    // Verify routing for blog_post → default → claude-opus
    const entry = manifest.routing["blog_post"] ?? manifest.routing.default;
    expect(entry).toBe("claude-opus");
  });

  it("metadata routes to claude-sonnet", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    expect(manifest.routing.metadata).toBe("claude-sonnet");
  });

  it("system_context includes tone-examples", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    expect(manifest.system_context).toContain("context/tone-examples.md");
  });

  it("task_context loads blog_post templates and few-shot", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    const blogContext = manifest.task_context.blog_post;
    expect(blogContext).toBeDefined();
    expect(blogContext).toContain("context/templates/blog-post.md");
    expect(blogContext).toContain("context/few-shot/blog-good.md");
    expect(blogContext).toContain("context/few-shot/blog-bad.md");
  });

  it("self_eval config has correct criteria", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    expect(manifest.self_eval!.criteria).toHaveLength(3);
    expect(manifest.self_eval!.threshold).toBe(0.7);
  });

  it("writable includes memory files", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    expect(manifest.writable).toContain("memory/learnings.json");
    expect(manifest.writable).toContain("memory/feedback-log.json");
  });
});

describe("Brand Agent – integration", () => {
  it("agent-loader correctly parses brand agent.yaml", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "brand");

    expect(manifest.name).toBe("Brand Agent");
    expect(manifest.slug).toBe("brand");
    expect(manifest.has_veto).toBe(true);
    expect(manifest.routing.default).toBe("claude-opus");
    expect(manifest.max_iterations).toBe(5);
  });

  it("brand agent has review-checklist in system_context", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "brand");
    expect(manifest.system_context).toContain("context/review-checklist.md");
    expect(manifest.system_context).toContain("context/few-shot/review-approved.md");
    expect(manifest.system_context).toContain("context/few-shot/review-rejected.md");
  });
});

describe("All agents – integration", () => {
  const agentSlugs = ["content", "brand", "strategy", "campaign", "seo", "lead", "analytics"];

  it.each(agentSlugs)("%s: agent.yaml loads without error", (slug) => {
    expect(() => loadAgentManifest(mockConfig.knowledgeDir, slug)).not.toThrow();
  });

  it.each(agentSlugs)("%s: has max_iterations set", (slug) => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, slug);
    expect(manifest.max_iterations).toBe(5);
  });

  it("no agent has sample_review_rate: 0.0 except brand", () => {
    for (const slug of agentSlugs) {
      const manifest = loadAgentManifest(mockConfig.knowledgeDir, slug);
      if (slug !== "brand") {
        expect(manifest.sample_review_rate).toBeGreaterThan(0);
      }
    }
  });
});

// --- Routing fallback integration test ---

describe("routeRequest – fallback integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls fallback model when primary fails with retryable error", async () => {
    const err503 = new Error("Service unavailable") as any;
    err503.status = 503;

    // First call (primary) fails, second call (fallback) succeeds
    mockCallClaude.mockRejectedValueOnce(err503).mockResolvedValueOnce({
      text: "fallback response",
      model: "claude-opus-4-6",
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 500,
      costUsd: 0.01,
    });

    const result = await routeRequest(
      mockConfig,
      mockLogger,
      {
        default: { primary: "claude-sonnet", fallback: "claude-opus" },
      },
      "blog_post",
      { userPrompt: "test" },
    );

    expect(result.text).toBe("fallback response");
    expect(mockCallClaude).toHaveBeenCalledTimes(2);
    // Primary was claude-sonnet-4-6
    expect(mockCallClaude.mock.calls[0][1]).toBe("claude-sonnet-4-6");
    // Fallback was claude-opus-4-6
    expect(mockCallClaude.mock.calls[1][1]).toBe("claude-opus-4-6");
  });

  it("does NOT call fallback for non-retryable error (400)", async () => {
    const err400 = new Error("Bad request") as any;
    err400.status = 400;

    mockCallClaude.mockRejectedValueOnce(err400);

    await expect(
      routeRequest(
        mockConfig,
        mockLogger,
        {
          default: { primary: "claude-sonnet", fallback: "claude-opus" },
        },
        "blog_post",
        { userPrompt: "test" },
      ),
    ).rejects.toThrow("Bad request");

    expect(mockCallClaude).toHaveBeenCalledTimes(1);
  });

  it("throws when both primary and fallback fail", async () => {
    const err503 = new Error("Service unavailable") as any;
    err503.status = 503;

    mockCallClaude.mockRejectedValueOnce(err503).mockRejectedValueOnce(err503);

    await expect(
      routeRequest(
        mockConfig,
        mockLogger,
        {
          default: { primary: "claude-sonnet", fallback: "claude-opus" },
        },
        "blog_post",
        { userPrompt: "test" },
      ),
    ).rejects.toThrow("Service unavailable");
  });

  it("string routing (no fallback) throws directly on error", async () => {
    const err503 = new Error("Service unavailable") as any;
    err503.status = 503;

    mockCallClaude.mockRejectedValueOnce(err503);

    await expect(
      routeRequest(mockConfig, mockLogger, { default: "claude-sonnet" }, "blog_post", { userPrompt: "test" }),
    ).rejects.toThrow("Service unavailable");

    expect(mockCallClaude).toHaveBeenCalledTimes(1);
  });
});

// --- Self-eval flow through BaseAgent ---

// Concrete test agent to exercise base-agent self-eval flow
class TestAgent extends BaseAgent {
  readonly name = "Test Agent";
  readonly slug = "content"; // reuse content slug for DB lookup

  // Expose for testing
  public checkMaxIter(taskId: string) {
    this.checkMaxIterations(taskId);
  }
}

describe("BaseAgent – self-eval flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTask.mockResolvedValue("task-se-1");
  });

  it("self-eval pass: pipeline.self_eval is populated, revision_triggered=false", async () => {
    // Generation call
    mockCallClaude.mockResolvedValueOnce({
      text: "Generated content",
      model: "claude-opus-4-6",
      tokensIn: 1000,
      tokensOut: 500,
      durationMs: 2000,
      costUsd: 0.1,
    });
    // Self-eval call
    mockCallClaude.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 50,
      durationMs: 500,
      costUsd: 0.001,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: true, score: 0.9, issues: [] },
      },
    });

    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    const agent = new TestAgent(mockConfig, mockLogger, mockSupabase, manifest);
    const result = await agent.execute({
      type: "blog_post",
      title: "Test blog",
      input: "Write a blog post",
    });

    expect(result.status).toBe("awaiting_review");
    expect(result.pipeline).toBeDefined();
    expect(result.pipeline!.self_eval).toBeDefined();
    expect(result.pipeline!.self_eval!.pass).toBe(true);
    expect(result.pipeline!.self_eval!.score).toBe(0.9);
    expect(result.pipeline!.self_eval!.revision_triggered).toBe(false);
  });

  it("self-eval fail (score > 0.4): triggers revision and accumulates tokens", async () => {
    // Generation call
    mockCallClaude.mockResolvedValueOnce({
      text: "Draft content",
      model: "claude-opus-4-6",
      tokensIn: 1000,
      tokensOut: 500,
      durationMs: 2000,
      costUsd: 0.1,
    });
    // Self-eval call (fail)
    mockCallClaude.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 80,
      durationMs: 600,
      costUsd: 0.002,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: false, score: 0.55, issues: ["Passivt språk", "Saknar CTA"] },
      },
    });
    // Revision call
    mockCallClaude.mockResolvedValueOnce({
      text: "Improved content with CTA",
      model: "claude-opus-4-6",
      tokensIn: 1200,
      tokensOut: 600,
      durationMs: 2500,
      costUsd: 0.12,
    });

    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    const agent = new TestAgent(mockConfig, mockLogger, mockSupabase, manifest);
    const result = await agent.execute({
      type: "blog_post",
      title: "Test blog",
      input: "Write a blog post",
    });

    expect(result.status).toBe("awaiting_review");
    expect(result.output).toBe("Improved content with CTA");
    expect(result.pipeline!.self_eval!.revision_triggered).toBe(true);
    // Tokens should be accumulated: generation + revision
    expect(result.tokensIn).toBe(1000 + 1200);
    expect(result.tokensOut).toBe(500 + 600);
  });

  it("self-eval: LLM says pass=true but score below threshold → triggers revision (threshold-driven)", async () => {
    // Generation call
    mockCallClaude.mockResolvedValueOnce({
      text: "Mediocre content",
      model: "claude-opus-4-6",
      tokensIn: 1000,
      tokensOut: 500,
      durationMs: 2000,
      costUsd: 0.1,
    });
    // Self-eval: LLM says pass=true, but score 0.6 is below threshold 0.7
    mockCallClaude.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 50,
      durationMs: 500,
      costUsd: 0.001,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: true, score: 0.6, issues: ["Svag inledning"] },
      },
    });
    // Revision call (triggered because score < threshold despite pass=true)
    mockCallClaude.mockResolvedValueOnce({
      text: "Improved content",
      model: "claude-opus-4-6",
      tokensIn: 1100,
      tokensOut: 550,
      durationMs: 2200,
      costUsd: 0.11,
    });

    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    const agent = new TestAgent(mockConfig, mockLogger, mockSupabase, manifest);
    const result = await agent.execute({
      type: "blog_post",
      title: "Test blog",
      input: "Write a blog post",
    });

    expect(result.status).toBe("awaiting_review");
    expect(result.output).toBe("Improved content");
    expect(result.pipeline!.self_eval!.revision_triggered).toBe(true);
    // 3 calls: generation + self-eval + revision
    expect(mockCallClaude).toHaveBeenCalledTimes(3);
  });

  it("self-eval: score above threshold → no revision regardless of LLM pass field", async () => {
    // Generation call
    mockCallClaude.mockResolvedValueOnce({
      text: "Good content",
      model: "claude-opus-4-6",
      tokensIn: 1000,
      tokensOut: 500,
      durationMs: 2000,
      costUsd: 0.1,
    });
    // Self-eval: LLM says pass=false, but score 0.75 is above threshold 0.7
    mockCallClaude.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 50,
      durationMs: 500,
      costUsd: 0.001,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: false, score: 0.75, issues: ["Minor nitpick"] },
      },
    });

    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    const agent = new TestAgent(mockConfig, mockLogger, mockSupabase, manifest);
    const result = await agent.execute({
      type: "blog_post",
      title: "Test blog",
      input: "Write a blog post",
    });

    expect(result.status).toBe("awaiting_review");
    expect(result.output).toBe("Good content");
    expect(result.pipeline!.self_eval!.revision_triggered).toBe(false);
    // Only 2 calls: generation + self-eval. No revision.
    expect(mockCallClaude).toHaveBeenCalledTimes(2);
  });

  it("self-eval fail (score <= 0.4): attempts revision, re-evals, then marks error if still low", async () => {
    // Generation call
    mockCallClaude.mockResolvedValueOnce({
      text: "Bad content",
      model: "claude-opus-4-6",
      tokensIn: 1000,
      tokensOut: 500,
      durationMs: 2000,
      costUsd: 0.1,
    });
    // Self-eval call (very low score)
    mockCallClaude.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 80,
      durationMs: 600,
      costUsd: 0.002,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: false, score: 0.2, issues: ["Completely off-topic"] },
      },
    });
    // Revision call
    mockCallClaude.mockResolvedValueOnce({
      text: "Revised content",
      model: "claude-opus-4-6",
      tokensIn: 800,
      tokensOut: 400,
      durationMs: 1500,
      costUsd: 0.08,
    });
    // Re-eval call (still low score)
    mockCallClaude.mockResolvedValueOnce({
      text: "",
      model: "claude-sonnet-4-6",
      tokensIn: 200,
      tokensOut: 80,
      durationMs: 600,
      costUsd: 0.002,
      toolUse: {
        toolName: "self_eval_response",
        input: { pass: false, score: 0.3, issues: ["Still off-topic"] },
      },
    });

    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    const agent = new TestAgent(mockConfig, mockLogger, mockSupabase, manifest);
    const result = await agent.execute({
      type: "blog_post",
      title: "Test blog",
      input: "Write a blog post",
    });

    expect(result.status).toBe("error");
    // 4 LLM calls: generation + self-eval + revision + re-eval
    expect(mockCallClaude).toHaveBeenCalledTimes(4);
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
      mockSupabase,
      "task-se-1",
      "error",
      expect.objectContaining({
        content_json: expect.objectContaining({ error: "Self-eval score too low" }),
      }),
    );
  });
});

// --- max_iterations enforcement ---

describe("BaseAgent – max_iterations", () => {
  it("throws after exceeding max_iterations", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    const agent = new TestAgent(mockConfig, mockLogger, mockSupabase, manifest);

    // max_iterations is 5 – first 5 calls should be fine
    for (let i = 0; i < 5; i++) {
      expect(() => agent.checkMaxIter("task-loop-1")).not.toThrow();
    }

    // 6th call should throw
    expect(() => agent.checkMaxIter("task-loop-1")).toThrow(/Max iterations.*5.*exceeded/);
  });

  it("tracks iterations per task independently", () => {
    const manifest = loadAgentManifest(mockConfig.knowledgeDir, "content");
    const agent = new TestAgent(mockConfig, mockLogger, mockSupabase, manifest);

    for (let i = 0; i < 4; i++) {
      agent.checkMaxIter("task-a");
      agent.checkMaxIter("task-b");
    }

    // Both at 4, one more is fine
    expect(() => agent.checkMaxIter("task-a")).not.toThrow();
    // task-a is now at 5, task-b still at 4
    expect(() => agent.checkMaxIter("task-b")).not.toThrow();

    // Both at 5 → next call throws
    expect(() => agent.checkMaxIter("task-a")).toThrow(/Max iterations/);
    expect(() => agent.checkMaxIter("task-b")).toThrow(/Max iterations/);
  });
});
