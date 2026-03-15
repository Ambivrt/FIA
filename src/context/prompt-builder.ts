import { LoadedSkill } from "../agents/agent-loader";

export function buildSystemPrompt(
  brandContext: string,
  skills: LoadedSkill[] | string,
  extraContext?: string
): string {
  const parts = [
    "# Brand Context\n\n" + brandContext,
  ];

  if (typeof skills === "string") {
    // Legacy: plain string agent skill
    parts.push("# Agent Role\n\n" + skills);
  } else if (skills.length > 0) {
    const skillSections = skills.map(
      (skill) => `## Skill: ${skill.metadata.name}\n\n${skill.content}`
    );
    parts.push("# Agent Skills\n\n" + skillSections.join("\n\n---\n\n"));
  }

  if (extraContext) {
    parts.push("# Additional Context\n\n" + extraContext);
  }

  return parts.join("\n\n---\n\n");
}

export function buildTaskPrompt(
  taskContext: string,
  userInput: string
): string {
  const parts: string[] = [];

  if (taskContext) {
    parts.push("# Task Guidelines\n\n" + taskContext);
  }

  parts.push("# Task\n\n" + userInput);

  return parts.join("\n\n---\n\n");
}
