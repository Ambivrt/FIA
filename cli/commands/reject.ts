// fia reject <task-id> --feedback "..." – Avslå en task

import { Command } from "commander";
import { apiPost } from "../lib/api-client";
import { successMsg } from "../lib/formatters";
import { resolveTaskId } from "./helpers";

export function registerRejectCommand(program: Command): void {
  program
    .command("reject <task-id>")
    .description("Reject a task (feedback required)")
    .requiredOption("--feedback <text>", "Feedback message (required)")
    .action(async (taskId: string, opts: { feedback: string }) => {
      const fullId = await resolveTaskId(taskId);

      await apiPost(`/api/tasks/${fullId}/reject`, {
        feedback: opts.feedback,
      });

      successMsg(`Task ${taskId} rejected.`);
    });
}
