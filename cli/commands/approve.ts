// fia approve <task-id> [--feedback "..."] – Godkänn en task

import { Command } from "commander";
import { apiPost } from "../lib/api-client";
import { successMsg } from "../lib/formatters";
import { resolveTaskId } from "./helpers";

export function registerApproveCommand(program: Command): void {
  program
    .command("approve <task-id>")
    .description("Approve a task")
    .option("--feedback <text>", "Optional feedback message")
    .action(async (taskId: string, opts: { feedback?: string }) => {
      const fullId = await resolveTaskId(taskId);

      await apiPost(`/api/tasks/${fullId}/approve`, {
        feedback: opts.feedback,
      });

      successMsg(`Task ${taskId} approved.`);
    });
}
