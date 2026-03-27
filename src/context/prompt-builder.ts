import { LoadedSkill } from "../agents/agent-loader";

/** Estimate token count from text length (conservative for mixed Swedish/English). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Trim context progressively to fit within a token budget.
 * Strategy: remove few-shot bad examples first, then truncate proportionally.
 */
export function trimContext(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;

  const maxChars = Math.floor(maxTokens * 3.5);

  // Step 1: Remove few-shot bad example sections (identifiable by pattern)
  let trimmed = text.replace(/## (?:Dåligt|Bad) (?:exempel|example)[\s\S]*?(?=\n## |\n---\n|$)/gi, "");
  if (trimmed.length <= maxChars) return trimmed;

  // Step 2: Truncate to max chars with ellipsis
  trimmed = trimmed.slice(0, maxChars);
  const lastBreak = trimmed.lastIndexOf("\n\n");
  if (lastBreak > maxChars * 0.8) {
    trimmed = trimmed.slice(0, lastBreak);
  }
  return trimmed + "\n\n[... trimmat för kontextgräns ...]";
}

export function buildSystemPrompt(brandContext: string, skills: LoadedSkill[] | string, extraContext?: string, maxTokens?: number): string {
  const parts = ["# Brand Context\n\n" + brandContext];

  if (typeof skills === "string") {
    // Legacy: plain string agent skill
    parts.push("# Agent Role\n\n" + skills);
  } else if (skills.length > 0) {
    const skillSections = skills.map((skill) => `## Skill: ${skill.metadata.name}\n\n${skill.content}`);
    parts.push("# Agent Skills\n\n" + skillSections.join("\n\n---\n\n"));
  }

  if (extraContext) {
    parts.push("# Additional Context\n\n" + extraContext);
  }

  const result = parts.join("\n\n---\n\n");
  return maxTokens ? trimContext(result, maxTokens) : result;
}

export function buildTaskPrompt(taskContext: string, userInput: string, maxTokens?: number): string {
  const parts: string[] = [];

  if (taskContext) {
    parts.push("# Task Guidelines\n\n" + taskContext);
  }

  parts.push("# Task\n\n" + userInput);

  const result = parts.join("\n\n---\n\n");
  return maxTokens ? trimContext(result, maxTokens) : result;
}
