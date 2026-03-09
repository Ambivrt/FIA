import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

export interface AgentManifest {
  name: string;
  slug: string;
  version: string;
  routing: Record<string, string>;
  system_context: string[];
  task_context: Record<string, string[]>;
  tools: string[];
  autonomy: "autonomous" | "semi-autonomous" | "manual";
  escalation_threshold: number;
  sample_review_rate: number;
  writable: string[];
  has_veto?: boolean;
  budget_limit_sek?: number;
  score_threshold_mql?: number;
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
