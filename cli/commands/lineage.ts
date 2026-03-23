// fia lineage <task-id> – Visa task-träd (föräldrar och barn)
//
// Kör: fia lineage <task-id> [--depth <n>]

import { Command } from "commander";
import chalk from "chalk";
import { apiGet } from "../lib/api-client";
import { shortId, relativeTime, EARTH, GRADIENT } from "../lib/formatters";
import type { LineageTask, TaskResponse } from "../types";

interface LineageResponse {
  ancestors: LineageTask[];
  children: LineageTask[];
}

// Status color mapping (subset – full 17-status model)
function statusColor(status: string): string {
  switch (status) {
    case "completed":
    case "delivered":
    case "published":
      return chalk.green(status);
    case "in_progress":
    case "activated":
      return chalk.yellow(status);
    case "queued":
    case "triggered":
      return chalk.cyan(status);
    case "rejected":
    case "error":
    case "cancelled":
      return chalk.red(status);
    case "awaiting_review":
    case "escalated":
      return chalk.magenta(status);
    default:
      return chalk.dim(status);
  }
}

function agentLabel(task: LineageTask): string {
  const slug = task.agents?.slug ?? "?";
  return EARTH.plum(slug);
}

function taskLine(task: LineageTask, indent: string, connector: string): string {
  const id = chalk.dim(shortId(task.id));
  const agent = agentLabel(task);
  const type = chalk.bold(task.type);
  const status = statusColor(task.status);
  const trigger = task.trigger_source ? chalk.dim(` ← ${task.trigger_source}`) : "";
  const title = task.title ? chalk.dim(` "${task.title.slice(0, 40)}"`) : "";

  return `${indent}${connector} [${id}] ${agent}/${type} ${status}${trigger}${title}\n`;
}

export function registerLineageCommand(program: Command): void {
  program
    .command("lineage <task-id>")
    .description("Show task parent/child relationship tree")
    .action(async (taskId: string) => {
      // Resolve short ID
      const fullId = await resolveTaskId(taskId);

      // Fetch the task itself and its lineage
      const [taskRes, lineageRes] = await Promise.all([
        apiGet<TaskResponse>(`/api/tasks/${fullId}`),
        apiGet<LineageResponse>(`/api/tasks/${fullId}/lineage`),
      ]);

      const task = taskRes.data as unknown as LineageTask & { title: string };
      const { ancestors, children } = lineageRes.data as unknown as LineageResponse;

      // Header
      process.stdout.write("\n" + EARTH.plum("  Task Lineage\n\n"));

      // Ancestors (root → ... → immediate parent)
      if (ancestors.length > 0) {
        process.stdout.write(chalk.dim("  Ancestors:\n"));
        for (let i = 0; i < ancestors.length; i++) {
          const indent = "  " + "  ".repeat(i);
          const connector = i === ancestors.length - 1 ? "└─" : "├─";
          process.stdout.write(taskLine(ancestors[i], indent, connector));
        }
        process.stdout.write("\n");
      }

      // Current task
      const currentIndent = ancestors.length > 0 ? "  " + "  ".repeat(ancestors.length) : "  ";
      const currentConnector = ancestors.length > 0 ? "└─" : "▶";
      const currentLine = taskLine(
        { ...task, trigger_source: (task as unknown as LineageTask).trigger_source },
        currentIndent,
        currentConnector,
      );
      process.stdout.write(GRADIENT.orange("  Current task:\n"));
      process.stdout.write(currentLine);

      // Children
      if (children.length > 0) {
        process.stdout.write("\n" + chalk.dim("  Children:\n"));
        for (let i = 0; i < children.length; i++) {
          const isLast = i === children.length - 1;
          const connector = isLast ? "└─" : "├─";
          process.stdout.write(taskLine(children[i], "    ", connector));
        }
      } else {
        process.stdout.write(chalk.dim("  No children.\n"));
      }

      process.stdout.write("\n");
    });
}

// ─── Resolve short task ID ────────────────────────────────────────────────────

async function resolveTaskId(input: string): Promise<string> {
  if (input.length === 36 && input.includes("-")) return input;

  const res = await apiGet<TaskResponse[]>("/api/tasks", { per_page: "100", sort: "-created_at" });
  const tasks = (res as unknown as { data: TaskResponse[] }).data;
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
