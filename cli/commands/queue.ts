// fia queue – Visa köade och pågående tasks

import { Command } from "commander";
import { apiGet } from "../lib/api-client";
import { createTable, shortId, relativeTime } from "../lib/formatters";
import type { TaskResponse, PaginatedResponse } from "../types";

export function registerQueueCommand(program: Command): void {
  program
    .command("queue")
    .description("Show queued and running tasks")
    .option("--verbose", "Show full task IDs")
    .action(async (opts: { verbose?: boolean }) => {
      const { data: tasks } = (await apiGet<TaskResponse[]>("/api/tasks", {
        status: "queued,in_progress",
        sort: "-priority",
        per_page: "50",
      })) as PaginatedResponse<TaskResponse>;

      if (tasks.length === 0) {
        process.stdout.write("No queued or running tasks.\n");
        return;
      }

      const table = createTable(["ID", "Agent", "Type", "Priority", "Status", "Created"]);

      for (const task of tasks) {
        const id = opts.verbose ? task.id : shortId(task.id);
        const agentSlug = task.agents?.slug ?? "—";

        table.push([id, agentSlug, task.type, task.priority, task.status, relativeTime(task.created_at)]);
      }

      process.stdout.write(table.toString() + "\n");
    });
}
