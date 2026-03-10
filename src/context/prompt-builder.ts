export function buildSystemPrompt(
  brandContext: string,
  agentSkill: string,
  extraContext?: string
): string {
  const parts = [
    "# Brand Context\n\n" + brandContext,
    "# Agent Role\n\n" + agentSkill,
  ];

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
