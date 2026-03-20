import { extractConfigJson, mergeConfigJson, syncAgentManifests, AgentConfigJson } from "../src/supabase/manifest-sync";
import { AgentManifest } from "../src/agents/agent-loader";
import { Logger } from "../src/gateway/logger";

// Mock agent-factory
const mockGetAllAgentSlugs = jest.fn().mockReturnValue(["content", "brand"]);
jest.mock("../src/agents/agent-factory", () => ({
  getAllAgentSlugs: () => mockGetAllAgentSlugs(),
}));

// Mock agent-loader
const mockLoadAgentManifest = jest.fn();
jest.mock("../src/agents/agent-loader", () => ({
  loadAgentManifest: (...args: unknown[]) => mockLoadAgentManifest(...args),
}));

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function makeManifest(overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    name: "Content Agent",
    slug: "content",
    version: "1.0.0",
    routing: { default: "claude-opus", metadata: "claude-sonnet" },
    system_context: [],
    task_context: { blog_post: ["templates/blog.md"], linkedin: ["templates/linkedin.md"] },
    tools: ["buffer", "gws:docs"],
    autonomy: "autonomous",
    escalation_threshold: 3,
    sample_review_rate: 0.2,
    max_iterations: 5,
    writable: ["memory/learnings.json"],
    ...overrides,
  };
}

describe("extractConfigJson", () => {
  it("extracts routing, tools, task_types from manifest", () => {
    const manifest = makeManifest();
    const config = extractConfigJson(manifest);

    expect(config.routing).toEqual({ default: "claude-opus", metadata: "claude-sonnet" });
    expect(config.tools).toEqual(["buffer", "gws:docs"]);
    expect(config.task_types).toEqual(expect.arrayContaining(["blog_post", "linkedin", "metadata"]));
    expect(config.task_types).not.toContain("default");
    expect(config.autonomy).toBe("autonomous");
    expect(config.sample_review_rate).toBe(0.2);
    expect(config.escalation_threshold).toBe(3);
    expect(config._manifest_version).toBe("1.0.0");
  });

  it("includes optional fields when present", () => {
    const manifest = makeManifest({
      has_veto: true,
      budget_limit_sek: 10000,
      score_threshold_mql: 75,
      self_eval: { enabled: true, model: "claude-sonnet", criteria: ["test"], threshold: 0.7 },
    });
    const config = extractConfigJson(manifest);

    expect(config.has_veto).toBe(true);
    expect(config.budget_limit_sek).toBe(10000);
    expect(config.score_threshold_mql).toBe(75);
    expect(config.self_eval).toEqual({ enabled: true, model: "claude-sonnet", criteria: ["test"], threshold: 0.7 });
  });

  it("omits optional fields when absent", () => {
    const manifest = makeManifest();
    const config = extractConfigJson(manifest);

    expect(config.has_veto).toBeUndefined();
    expect(config.budget_limit_sek).toBeUndefined();
    expect(config.score_threshold_mql).toBeUndefined();
    expect(config.self_eval).toBeUndefined();
  });

  it("deduplicates task_types from task_context and routing", () => {
    const manifest = makeManifest({
      routing: { default: "claude-opus", blog_post: "claude-sonnet" },
      task_context: { blog_post: ["templates/blog.md"] },
    });
    const config = extractConfigJson(manifest);

    const blogPostCount = config.task_types.filter((t) => t === "blog_post").length;
    expect(blogPostCount).toBe(1);
  });
});

describe("mergeConfigJson", () => {
  const manifestConfig: AgentConfigJson = {
    routing: { default: "claude-opus", metadata: "claude-sonnet" },
    tools: ["buffer", "gws:docs"],
    task_types: ["blog_post", "metadata"],
    autonomy: "autonomous",
    sample_review_rate: 0.2,
    escalation_threshold: 3,
    _manifest_version: "1.0.0",
  };

  it("returns manifest config when existing is null", () => {
    const merged = mergeConfigJson(manifestConfig, null);
    expect(merged).toEqual(manifestConfig);
  });

  it("returns manifest config when existing is empty", () => {
    const merged = mergeConfigJson(manifestConfig, {});
    expect(merged).toEqual(manifestConfig);
  });

  it("preserves admin-overridden routing", () => {
    const existing = {
      routing: { default: "claude-sonnet" },
      tools: ["old-tool"],
      _admin_overrides: ["routing"],
    };
    const merged = mergeConfigJson(manifestConfig, existing);

    // routing should be the admin override, not manifest
    expect(merged.routing).toEqual({ default: "claude-sonnet" });
    // tools should be from manifest (not overridden)
    expect(merged.tools).toEqual(["buffer", "gws:docs"]);
    expect(merged._admin_overrides).toEqual(["routing"]);
  });

  it("preserves admin-overridden tools", () => {
    const existing = {
      tools: ["hubspot"],
      _admin_overrides: ["tools"],
    };
    const merged = mergeConfigJson(manifestConfig, existing);

    expect(merged.tools).toEqual(["hubspot"]);
    expect(merged.routing).toEqual(manifestConfig.routing);
  });

  it("preserves multiple admin overrides", () => {
    const existing = {
      routing: { default: "claude-sonnet" },
      tools: ["hubspot"],
      _admin_overrides: ["routing", "tools"],
    };
    const merged = mergeConfigJson(manifestConfig, existing);

    expect(merged.routing).toEqual({ default: "claude-sonnet" });
    expect(merged.tools).toEqual(["hubspot"]);
    expect(merged.task_types).toEqual(manifestConfig.task_types);
  });

  it("overwrites non-overridden fields from existing config", () => {
    const existing = {
      routing: { default: "old" },
      tools: ["old"],
      task_types: ["old"],
      _manifest_version: "0.9.0",
    };
    const merged = mergeConfigJson(manifestConfig, existing);

    expect(merged.routing).toEqual(manifestConfig.routing);
    expect(merged.tools).toEqual(manifestConfig.tools);
    expect(merged._manifest_version).toBe("1.0.0");
  });
});

describe("syncAgentManifests", () => {
  let mockUpdate: jest.Mock;
  let mockInsert: jest.Mock;
  let mockSelectSingle: jest.Mock;
  let mockSupabase: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    mockInsert = jest.fn().mockResolvedValue({ error: null });
    mockSelectSingle = jest.fn();

    mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: mockSelectSingle,
          }),
        }),
        update: mockUpdate,
        insert: mockInsert,
      })),
    };
  });

  it("syncs manifests to empty config_json", async () => {
    const contentManifest = makeManifest();
    const brandManifest = makeManifest({
      name: "Brand Agent",
      slug: "brand",
      routing: { default: "claude-opus" },
      tools: [],
      task_context: {},
      has_veto: true,
    });

    mockLoadAgentManifest.mockImplementation((_dir: string, slug: string) => {
      if (slug === "content") return contentManifest;
      if (slug === "brand") return brandManifest;
      throw new Error(`Unknown: ${slug}`);
    });

    mockSelectSingle
      .mockResolvedValueOnce({ data: { id: "id-content", config_json: {} }, error: null })
      .mockResolvedValueOnce({ data: { id: "id-brand", config_json: {} }, error: null });

    await syncAgentManifests(mockSupabase as never, { knowledgeDir: "/fake" } as never, mockLogger);

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("2 synced, 0 failed"), expect.any(Object));
  });

  it("inserts new agent when not found in Supabase", async () => {
    mockGetAllAgentSlugs.mockReturnValue(["content"]);
    mockLoadAgentManifest.mockReturnValue(makeManifest());
    mockSelectSingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    await syncAgentManifests(mockSupabase as never, { knowledgeDir: "/fake" } as never, mockLogger);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Content Agent",
        slug: "content",
        status: "idle",
        autonomy_level: "autonomous",
      }),
    );
  });

  it("continues when one agent fails", async () => {
    mockGetAllAgentSlugs.mockReturnValue(["content", "brand"]);

    mockLoadAgentManifest.mockImplementation((_dir: string, slug: string) => {
      if (slug === "content") throw new Error("manifest not found");
      return makeManifest({
        name: "Brand Agent",
        slug: "brand",
        routing: { default: "claude-opus" },
        tools: [],
        task_context: {},
      });
    });

    mockSelectSingle.mockResolvedValueOnce({ data: { id: "id-brand", config_json: {} }, error: null });

    await syncAgentManifests(mockSupabase as never, { knowledgeDir: "/fake" } as never, mockLogger);

    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("content"), expect.any(Object));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("1 synced, 1 failed"), expect.any(Object));
  });

  it("preserves admin overrides during sync", async () => {
    mockGetAllAgentSlugs.mockReturnValue(["content"]);
    mockLoadAgentManifest.mockReturnValue(makeManifest());

    const adminConfig = {
      routing: { default: "claude-sonnet" },
      tools: ["custom-tool"],
      _admin_overrides: ["routing"],
    };
    mockSelectSingle.mockResolvedValueOnce({ data: { id: "id-content", config_json: adminConfig }, error: null });

    await syncAgentManifests(mockSupabase as never, { knowledgeDir: "/fake" } as never, mockLogger);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updateCall = mockUpdate.mock.calls[0][0];
    const configJson = updateCall.config_json;
    // Admin-overridden routing should be preserved
    expect(configJson.routing).toEqual({ default: "claude-sonnet" });
    // Non-overridden tools should come from manifest
    expect(configJson.tools).toEqual(["buffer", "gws:docs"]);
    expect(configJson._admin_overrides).toEqual(["routing"]);
  });
});
