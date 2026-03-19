import path from "path";
import fs from "fs";
import os from "os";
import {
  parseSkillReference,
  resolveSkillPath,
  parseSkillFrontmatter,
  loadSkills,
  loadAgentManifest,
  AgentManifest,
} from "../src/agents/agent-loader";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

describe("parseSkillReference", () => {
  it("parses shared skill reference", () => {
    const result = parseSkillReference("shared:brand-compliance");
    expect(result).toEqual({ scope: "shared", name: "brand-compliance" });
  });

  it("parses agent skill reference", () => {
    const result = parseSkillReference("agent:content-production");
    expect(result).toEqual({ scope: "agent", name: "content-production" });
  });

  it("throws on missing colon", () => {
    expect(() => parseSkillReference("brand-compliance")).toThrow("Invalid skill reference");
  });

  it("throws on invalid scope", () => {
    expect(() => parseSkillReference("global:something")).toThrow("Invalid skill scope");
  });

  it("throws on empty name", () => {
    expect(() => parseSkillReference("shared:")).toThrow("Empty skill name");
  });
});

describe("resolveSkillPath", () => {
  it("resolves shared skill to knowledge/skills/ directory", () => {
    const result = resolveSkillPath("/knowledge", "content", "shared:brand-compliance");
    expect(result).toBe("/knowledge/skills/brand-compliance/SKILL.md");
  });

  it("resolves agent skill to agent's skills/ directory", () => {
    const result = resolveSkillPath("/knowledge", "content", "agent:content-production");
    expect(result).toBe("/knowledge/agents/content/skills/content-production/SKILL.md");
  });
});

describe("parseSkillFrontmatter", () => {
  it("parses YAML frontmatter and markdown body", () => {
    const raw = `---
name: brand-compliance
description: Ensures brand alignment
version: 1.0.0
---

# Brand Compliance

Some rules here.`;

    const result = parseSkillFrontmatter(raw);
    expect(result.metadata.name).toBe("brand-compliance");
    expect(result.metadata.description).toBe("Ensures brand alignment");
    expect(result.metadata.version).toBe("1.0.0");
    expect(result.body).toContain("# Brand Compliance");
    expect(result.body).toContain("Some rules here.");
  });

  it("handles missing frontmatter gracefully", () => {
    const raw = "# Just markdown\n\nNo frontmatter here.";
    const result = parseSkillFrontmatter(raw);
    expect(result.metadata.name).toBe("unknown");
    expect(result.metadata.description).toBe("");
    expect(result.body).toContain("# Just markdown");
  });

  it("handles frontmatter without optional fields", () => {
    const raw = `---
name: test-skill
description: A test skill
---

Content here.`;

    const result = parseSkillFrontmatter(raw);
    expect(result.metadata.name).toBe("test-skill");
    expect(result.metadata.version).toBeUndefined();
  });
});

describe("loadSkills", () => {
  it("falls back to legacy SKILL.md when no skills field", () => {
    const manifest: AgentManifest = {
      name: "Content Agent",
      slug: "content",
      version: "1.0.0",
      routing: { default: "claude-opus" },
      system_context: ["SKILL.md"],
      task_context: {},
      tools: [],
      autonomy: "autonomous",
      escalation_threshold: 3,
      sample_review_rate: 0,
      writable: [],
    };

    const skills = loadSkills(KNOWLEDGE_DIR, "content", manifest);
    expect(skills.length).toBe(1);
    expect(skills[0].source).toBe("agent");
    expect(skills[0].content).toContain("Content Agent");
  });

  it("returns empty array when no skills and no legacy SKILL.md", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fia-test-"));
    const agentDir = path.join(tmpDir, "agents", "fake");
    fs.mkdirSync(agentDir, { recursive: true });

    const manifest: AgentManifest = {
      name: "Fake",
      slug: "fake",
      version: "1.0.0",
      routing: { default: "claude-opus" },
      system_context: [],
      task_context: {},
      tools: [],
      autonomy: "autonomous",
      escalation_threshold: 3,
      sample_review_rate: 0,
      writable: [],
    };

    const skills = loadSkills(tmpDir, "fake", manifest);
    expect(skills).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads skills from manifest skills field", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fia-test-"));

    // Create shared skill
    const sharedDir = path.join(tmpDir, "skills", "test-shared");
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(
      path.join(sharedDir, "SKILL.md"),
      `---
name: test-shared
description: A shared test skill
---

# Test Shared Skill

Shared content.`,
    );

    // Create agent skill
    const agentSkillDir = path.join(tmpDir, "agents", "test-agent", "skills", "test-agent-skill");
    fs.mkdirSync(agentSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentSkillDir, "SKILL.md"),
      `---
name: test-agent-skill
description: An agent-specific skill
---

# Agent Skill

Agent-specific content.`,
    );

    const manifest: AgentManifest = {
      name: "Test Agent",
      slug: "test-agent",
      version: "1.0.0",
      routing: { default: "claude-opus" },
      skills: ["shared:test-shared", "agent:test-agent-skill"],
      system_context: [],
      task_context: {},
      tools: [],
      autonomy: "autonomous",
      escalation_threshold: 3,
      sample_review_rate: 0,
      writable: [],
    };

    const skills = loadSkills(tmpDir, "test-agent", manifest);
    expect(skills.length).toBe(2);
    expect(skills[0].metadata.name).toBe("test-shared");
    expect(skills[0].source).toBe("shared");
    expect(skills[0].content).toContain("Shared content");
    expect(skills[1].metadata.name).toBe("test-agent-skill");
    expect(skills[1].source).toBe("agent");
    expect(skills[1].content).toContain("Agent-specific content");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("throws when skill file is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fia-test-"));
    fs.mkdirSync(path.join(tmpDir, "agents", "test"), { recursive: true });

    const manifest: AgentManifest = {
      name: "Test",
      slug: "test",
      version: "1.0.0",
      routing: { default: "claude-opus" },
      skills: ["shared:nonexistent"],
      system_context: [],
      task_context: {},
      tools: [],
      autonomy: "autonomous",
      escalation_threshold: 3,
      sample_review_rate: 0,
      writable: [],
    };

    expect(() => loadSkills(tmpDir, "test", manifest)).toThrow("Skill file not found");

    fs.rmSync(tmpDir, { recursive: true });
  });
});
