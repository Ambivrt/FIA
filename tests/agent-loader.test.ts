import path from "path";
import fs from "fs";
import { loadAgentManifest, resolveAgentFiles } from "../src/agents/agent-loader";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const ALL_SLUGS = ["content", "brand", "strategy", "campaign", "seo", "lead", "analytics"];

const VALID_MODELS = ["claude-opus", "claude-sonnet", "gemini-pro", "gemini-flash", "nano-banana-2", "google-search"];

describe("loadAgentManifest", () => {
  it.each(ALL_SLUGS)("loads %s manifest without error", (slug) => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, slug);
    expect(manifest.name).toBeTruthy();
    expect(manifest.slug).toBe(slug);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(ALL_SLUGS)("%s has valid routing.default", (slug) => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, slug);
    expect(VALID_MODELS).toContain(manifest.routing.default);
  });

  it.each(ALL_SLUGS)("%s routing values are all valid models", (slug) => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, slug);
    for (const [key, model] of Object.entries(manifest.routing)) {
      if (typeof model === "string") {
        expect(VALID_MODELS).toContain(model);
      } else if (typeof model === "object" && model !== null) {
        // { primary, fallback } routing object
        const obj = model as { primary: string; fallback?: string };
        expect(VALID_MODELS).toContain(obj.primary);
        if (obj.fallback) {
          expect(VALID_MODELS).toContain(obj.fallback);
        }
      }
    }
  });

  it.each(ALL_SLUGS)("%s has valid autonomy level", (slug) => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, slug);
    expect(["autonomous", "semi-autonomous", "manual"]).toContain(manifest.autonomy);
  });

  it.each(ALL_SLUGS)("%s system_context files exist", (slug) => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, slug);
    const agentDir = path.join(KNOWLEDGE_DIR, "agents", slug);
    for (const filePath of manifest.system_context) {
      const fullPath = path.join(agentDir, filePath);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it.each(ALL_SLUGS)("%s task_context files exist", (slug) => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, slug);
    const agentDir = path.join(KNOWLEDGE_DIR, "agents", slug);
    for (const [taskType, files] of Object.entries(manifest.task_context)) {
      for (const filePath of files) {
        const fullPath = path.join(agentDir, filePath);
        expect(fs.existsSync(fullPath)).toBe(true);
      }
    }
  });

  it.each(ALL_SLUGS)("%s writable paths are under memory/", (slug) => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, slug);
    for (const writablePath of manifest.writable) {
      expect(writablePath).toMatch(/^memory\//);
    }
  });

  it("throws for non-existent agent", () => {
    expect(() => loadAgentManifest(KNOWLEDGE_DIR, "nonexistent")).toThrow();
  });

  it("brand agent has veto power", () => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, "brand");
    expect(manifest.has_veto).toBe(true);
  });

  it("strategy agent requires full orchestrator review", () => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, "strategy");
    expect(manifest.sample_review_rate).toBe(1.0);
  });
});

describe("resolveAgentFiles", () => {
  it("concatenates multiple files with delimiter", () => {
    const manifest = loadAgentManifest(KNOWLEDGE_DIR, "content");
    const result = resolveAgentFiles(KNOWLEDGE_DIR, "content", manifest.system_context);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("skips non-existent files gracefully", () => {
    const result = resolveAgentFiles(KNOWLEDGE_DIR, "content", ["nonexistent-file.md"]);
    expect(result).toBe("");
  });
});
