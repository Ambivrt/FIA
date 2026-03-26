// fia run <agent> <task> [--priority high] – Trigga en task manuellt

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { apiPost, apiGet } from "../lib/api-client";
import { formatCost, formatTokens, errorMsg } from "../lib/formatters";
import type { TaskResponse } from "../types";

export function registerRunCommand(program: Command): void {
  program
    .command("run <agent> <task>")
    .description("Trigger a task manually on an agent")
    .option("--priority <level>", "Task priority (low, normal, high, urgent)", "normal")
    .option("--title <title>", "Optional task title")
    .action(async (agent: string, taskType: string, opts: { priority: string; title?: string }) => {
      // Skapa task
      const { data: task } = await apiPost<TaskResponse>("/api/tasks", {
        agent_slug: agent,
        type: taskType,
        title: opts.title,
        priority: opts.priority,
      });

      const spinner = ora(`${capitalize(agent)} Agent working on ${taskType}...`).start();

      // Polla task-status
      const startTime = Date.now();
      let result: TaskResponse | null = null;

      while (true) {
        await sleep(2000);

        try {
          const { data } = await apiGet<TaskResponse>(`/api/tasks/${task.id}`);
          result = data;

          if (data.status === "completed" || data.status === "approved" || data.status === "published") {
            spinner.succeed(`Task completed (task-id: ${task.id.slice(0, 8)})`);
            break;
          }

          if (data.status === "error") {
            spinner.fail(`Task failed (task-id: ${task.id.slice(0, 8)})`);
            break;
          }

          if (data.status === "awaiting_review") {
            spinner.info(`Task awaiting review (task-id: ${task.id.slice(0, 8)})`);
            break;
          }

          // Uppdatera spinner-text med progress + sub-status
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const sub = data.sub_status ? ` [${data.sub_status}]` : "";
          spinner.text = `${capitalize(agent)} Agent working on ${taskType}${sub}... (${elapsed}s)`;
        } catch {
          // Ignorera tillfälliga nätverksfel under polling
        }
      }

      // Visa resultat
      if (result) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const content = result.content_json as Record<string, unknown> | null;
        const title = content?.title || result.title;

        if (title) process.stdout.write(`  Title: ${chalk.bold(String(title))}\n`);
        process.stdout.write(
          `  Tokens: ${formatTokens(result.tokens_used)} | Cost: ${formatCost(result.cost_sek)} | Time: ${elapsed}s\n`,
        );

        if (result.status === "error") {
          errorMsg("Task ended with error.");
        }
      }
    });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
