import { resolveRoute, AgentRouting } from "../src/gateway/router";

// All 7 agents' routing as defined in their agent.yaml manifests
const AGENT_ROUTINGS: Record<string, AgentRouting> = {
  content: {
    default: "claude-opus",
    metadata: "claude-sonnet",
    alt_text: "claude-sonnet",
    ab_variants: "claude-sonnet",
    images: "nano-banana-2",
  },
  brand: {
    default: "claude-opus",
  },
  strategy: {
    default: "claude-opus",
    research: "google-search",
    trend_analysis: "google-search",
  },
  campaign: {
    default: "claude-opus",
    ab_variants: "claude-sonnet",
    segmentation: "claude-sonnet",
  },
  seo: {
    default: "google-search",
    bulk_optimization: "claude-sonnet",
    content_recommendations: "claude-opus",
  },
  lead: {
    default: "claude-sonnet",
    nurture_sequences: "claude-opus",
  },
  analytics: {
    default: "claude-sonnet",
    insights: "claude-opus",
    report_writing: "claude-opus",
  },
};

describe("resolveRoute", () => {
  describe("Content Agent routing", () => {
    const routing = AGENT_ROUTINGS.content;

    it("routes default to claude-opus", () => {
      const result = resolveRoute(routing, "blog_post");
      expect(result.alias).toBe("claude-opus");
      expect(result.provider).toBe("claude");
      expect(result.modelId).toBe("claude-opus-4-6");
    });

    it("routes metadata to claude-sonnet", () => {
      const result = resolveRoute(routing, "metadata");
      expect(result.alias).toBe("claude-sonnet");
      expect(result.provider).toBe("claude");
      expect(result.modelId).toBe("claude-sonnet-4-6");
    });

    it("routes alt_text to claude-sonnet", () => {
      const result = resolveRoute(routing, "alt_text");
      expect(result.alias).toBe("claude-sonnet");
    });

    it("routes ab_variants to claude-sonnet", () => {
      const result = resolveRoute(routing, "ab_variants");
      expect(result.alias).toBe("claude-sonnet");
    });

    it("routes images to nano-banana-2", () => {
      const result = resolveRoute(routing, "images");
      expect(result.alias).toBe("nano-banana-2");
      expect(result.provider).toBe("nano-banana");
      expect(result.modelId).toBe("gemini-2.0-flash-preview-image-generation");
    });
  });

  describe("Brand Agent routing", () => {
    const routing = AGENT_ROUTINGS.brand;

    it("always routes to claude-opus", () => {
      const result = resolveRoute(routing, "default");
      expect(result.alias).toBe("claude-opus");
      expect(result.provider).toBe("claude");
    });

    it("falls back to claude-opus for unknown task types", () => {
      const result = resolveRoute(routing, "unknown_task");
      expect(result.alias).toBe("claude-opus");
    });
  });

  describe("Strategy Agent routing", () => {
    const routing = AGENT_ROUTINGS.strategy;

    it("routes default to claude-opus", () => {
      const result = resolveRoute(routing, "quarterly_plan");
      expect(result.alias).toBe("claude-opus");
      expect(result.provider).toBe("claude");
    });

    it("routes research to google-search", () => {
      const result = resolveRoute(routing, "research");
      expect(result.alias).toBe("google-search");
      expect(result.provider).toBe("google-search");
    });

    it("routes trend_analysis to google-search", () => {
      const result = resolveRoute(routing, "trend_analysis");
      expect(result.alias).toBe("google-search");
    });
  });

  describe("Campaign Agent routing", () => {
    const routing = AGENT_ROUTINGS.campaign;

    it("routes default to claude-opus", () => {
      const result = resolveRoute(routing, "email_sequence");
      expect(result.alias).toBe("claude-opus");
    });

    it("routes ab_variants to claude-sonnet", () => {
      const result = resolveRoute(routing, "ab_variants");
      expect(result.alias).toBe("claude-sonnet");
    });

    it("routes segmentation to claude-sonnet", () => {
      const result = resolveRoute(routing, "segmentation");
      expect(result.alias).toBe("claude-sonnet");
    });
  });

  describe("SEO Agent routing", () => {
    const routing = AGENT_ROUTINGS.seo;

    it("routes default to google-search", () => {
      const result = resolveRoute(routing, "keyword_analysis");
      expect(result.alias).toBe("google-search");
      expect(result.provider).toBe("google-search");
    });

    it("routes bulk_optimization to claude-sonnet", () => {
      const result = resolveRoute(routing, "bulk_optimization");
      expect(result.alias).toBe("claude-sonnet");
    });

    it("routes content_recommendations to claude-opus", () => {
      const result = resolveRoute(routing, "content_recommendations");
      expect(result.alias).toBe("claude-opus");
    });
  });

  describe("Lead Agent routing", () => {
    const routing = AGENT_ROUTINGS.lead;

    it("routes default to claude-sonnet", () => {
      const result = resolveRoute(routing, "scoring");
      expect(result.alias).toBe("claude-sonnet");
      expect(result.provider).toBe("claude");
    });

    it("routes nurture_sequences to claude-opus", () => {
      const result = resolveRoute(routing, "nurture_sequences");
      expect(result.alias).toBe("claude-opus");
    });
  });

  describe("Analytics Agent routing", () => {
    const routing = AGENT_ROUTINGS.analytics;

    it("routes default to claude-sonnet", () => {
      const result = resolveRoute(routing, "data_extraction");
      expect(result.alias).toBe("claude-sonnet");
    });

    it("routes insights to claude-opus", () => {
      const result = resolveRoute(routing, "insights");
      expect(result.alias).toBe("claude-opus");
    });

    it("routes report_writing to claude-opus", () => {
      const result = resolveRoute(routing, "report_writing");
      expect(result.alias).toBe("claude-opus");
    });
  });

  describe("fallback behavior", () => {
    it("falls back to default for unknown task types", () => {
      const routing: AgentRouting = { default: "claude-sonnet" };
      const result = resolveRoute(routing, "completely_unknown");
      expect(result.alias).toBe("claude-sonnet");
    });
  });

  describe("provider mapping", () => {
    it("maps claude-opus to claude provider", () => {
      expect(resolveRoute({ default: "claude-opus" }, "x").provider).toBe("claude");
    });

    it("maps claude-sonnet to claude provider", () => {
      expect(resolveRoute({ default: "claude-sonnet" }, "x").provider).toBe("claude");
    });

    it("maps gemini-pro to gemini provider", () => {
      expect(resolveRoute({ default: "gemini-pro" }, "x").provider).toBe("gemini");
    });

    it("maps gemini-flash to gemini provider", () => {
      expect(resolveRoute({ default: "gemini-flash" }, "x").provider).toBe("gemini");
    });

    it("maps nano-banana-2 to nano-banana provider", () => {
      expect(resolveRoute({ default: "nano-banana-2" }, "x").provider).toBe("nano-banana");
    });

    it("maps google-search to google-search provider", () => {
      expect(resolveRoute({ default: "google-search" }, "x").provider).toBe("google-search");
    });
  });
});
