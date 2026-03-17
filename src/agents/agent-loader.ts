import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

import { SelfEvalConfig, RoutingEntry } from "../llm/types";

export interface AgentManifest {
  name: string;
  slug: string;
  version: string;
  routing: Record<string, string | RoutingEntry>;
  skills?: string[];
  system_context: string[];
  task_context: Record<string, string[]>;
  tools: string[];
  autonomy: "autonomous" | "semi-autonomous" | "manual";
  escalation_threshold: number;
  sample_review_rate: number;
  max_iterations?: number;
  writable: string[];
  has_veto?: boolean;
  budget_limit_sek?: number;
  score_threshold_mql?: number;
  self_eval?: SelfEvalConfig;
}

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
}

export interface LoadedSkill {
  metadata: SkillMetadata;
  content: string;
  source: "shared" | "agent";
}

export function loadAgentManifest(
  knowledgeDir: string,
  slug: string
): AgentManifest {
  const agentDir = path.join(knowledgeDir, "agents", slug);
  const yamlPath = path.join(agentDir, "agent.yaml");

  if (!fs.existsSync(yamlPath)) {
    throw new Error(`Agent manifest not found: ${yamlPath}`);
  }

  const raw = fs.readFileSync(yamlPath, "utf-8");
  const manifest = parseYaml(raw) as AgentManifest;

  // Defaults
  manifest.system_context = manifest.system_context ?? [];
  manifest.task_context = manifest.task_context ?? {};
  manifest.tools = manifest.tools ?? [];
  manifest.writable = manifest.writable ?? [];
  manifest.escalation_threshold = manifest.escalation_threshold ?? 3;
  manifest.sample_review_rate = manifest.sample_review_rate ?? 0;

  return manifest;
}

export function resolveAgentFiles(
  knowledgeDir: string,
  slug: string,
  relativePaths: string[]
): string {
  const agentDir = path.join(knowledgeDir, "agents", slug);
  return relativePaths
    .map((rel) => {
      const fullPath = path.join(agentDir, rel);
      if (!fs.existsSync(fullPath)) return "";
      return fs.readFileSync(fullPath, "utf-8");
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export function parseSkillReference(ref: string): { scope: "shared" | "agent"; name: string } {
  const colonIdx = ref.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(`Invalid skill reference "${ref}" – expected "shared:<name>" or "agent:<name>"`);
  }
  const scope = ref.slice(0, colonIdx);
  const name = ref.slice(colonIdx + 1);
  if (scope !== "shared" && scope !== "agent") {
    throw new Error(`Invalid skill scope "${scope}" in "${ref}" – must be "shared" or "agent"`);
  }
  if (!name) {
    throw new Error(`Empty skill name in "${ref}"`);
  }
  return { scope, name };
}

export function resolveSkillPath(
  knowledgeDir: string,
  slug: string,
  ref: string
): string {
  const { scope, name } = parseSkillReference(ref);
  if (scope === "shared") {
    return path.join(knowledgeDir, "skills", name, "SKILL.md");
  }
  return path.join(knowledgeDir, "agents", slug, "skills", name, "SKILL.md");
}

export function parseSkillFrontmatter(raw: string): { metadata: SkillMetadata; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = raw.match(frontmatterRegex);

  if (!match) {
    return {
      metadata: { name: "unknown", description: "" },
      body: raw.trim(),
    };
  }

  const yamlStr = match[1];
  const body = match[2].trim();
  const parsed = parseYaml(yamlStr) as Record<string, unknown>;

  return {
    metadata: {
      name: (parsed.name as string) ?? "unknown",
      description: (parsed.description as string) ?? "",
      version: parsed.version as string | undefined,
    },
    body,
  };
}

export function loadSkills(
  knowledgeDir: string,
  slug: string,
  manifest: AgentManifest
): LoadedSkill[] {
  if (!manifest.skills || manifest.skills.length === 0) {
    // Fallback: load legacy root SKILL.md as single skill
    const legacyPath = path.join(knowledgeDir, "agents", slug, "SKILL.md");
    if (!fs.existsSync(legacyPath)) return [];
    const raw = fs.readFileSync(legacyPath, "utf-8");
    const { metadata, body } = parseSkillFrontmatter(raw);
    return [{ metadata, content: body, source: "agent" }];
  }

  return manifest.skills.map((ref) => {
    const { scope } = parseSkillReference(ref);
    const skillPath = resolveSkillPath(knowledgeDir, slug, ref);

    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill file not found: ${skillPath} (ref: "${ref}")`);
    }

    const raw = fs.readFileSync(skillPath, "utf-8");
    const { metadata, body } = parseSkillFrontmatter(raw);
    return { metadata, content: body, source: scope };
  });
}
