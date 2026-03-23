// Delade hjälpfunktioner för kommandon

import { apiGet } from "../lib/api-client";
import type { TaskResponse, PaginatedResponse } from "../types";

/**
 * Resolve ett kort task-ID (6+ tecken) till ett fullständigt UUID.
 * Om det redan är ett fullständigt UUID (36 tecken), returnera direkt.
 */
export async function resolveTaskId(input: string): Promise<string> {
  // Fullständigt UUID
  if (input.length === 36 && input.includes("-")) {
    return input;
  }

  // Kort ID – sök i alla tasks
  const { data: tasks } = (await apiGet<TaskResponse[]>("/api/tasks", {
    per_page: "100",
    sort: "-created_at",
  })) as PaginatedResponse<TaskResponse>;

  const matches = tasks.filter((t) => t.id.startsWith(input));

  if (matches.length === 0) {
    process.stderr.write(`Error: No task found matching '${input}'\n`);
    process.exit(1);
  }

  if (matches.length > 1) {
    process.stderr.write(`Error: Multiple tasks match '${input}'. Use a longer ID prefix.\n`);
    process.exit(1);
  }

  return matches[0].id;
}
