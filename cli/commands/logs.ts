// fia logs [--agent content] [--action task_completed] [--limit 20]

import { Command } from "commander";
import chalk from "chalk";
import { apiGet } from "../lib/api-client";
import { colorByAgent } from "../lib/formatters";
import type { ActivityLogEntry, PaginatedResponse } from "../types";

export function registerLogsCommand(program: Command): void {
  program
    .command("logs")
    .description("Show activity log")
    .option("--agent <slug>", "Filter by agent")
    .option("--action <action>", "Filter by action type")
    .option("--limit <n>", "Number of entries to show", "10")
    .option("--verbose", "Show full timestamps and IDs")
    .action(async (opts: { agent?: string; action?: string; limit: string; verbose?: boolean }) => {
      const params: Record<string, string> = {
        per_page: opts.limit,
        sort: "-created_at",
      };
      if (opts.agent) params.agent_slug = opts.agent;
      if (opts.action) params.action = opts.action;

      const { data: entries } = await apiGet<ActivityLogEntry[]>("/api/activity", params) as PaginatedResponse<ActivityLogEntry>;

      if (entries.length === 0) {
        process.stdout.write("No activity entries found.\n");
        return;
      }

      for (const entry of entries) {
        const time = opts.verbose
          ? new Date(entry.created_at).toISOString()
          : new Date(entry.created_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        const agent = entry.agents?.slug ?? "system";
        const details = entry.details_json ? summarizeDetails(entry.details_json) : "";

        process.stdout.write(
          `${chalk.dim(`[${time}]`)} ${colorByAgent(agent, agent.padEnd(14))} ${entry.action.padEnd(20)} ${details}\n`,
        );
      }
    });
}

function summarizeDetails(details: Record<string, unknown>): string {
  const parts: string[] = [];
  if (details.task_id) parts.push(`task ${String(details.task_id).slice(0, 8)}`);
  if (details.type) parts.push(String(details.type));
  if (details.title) parts.push(`"${String(details.title).slice(0, 40)}"`);
  if (details.feedback) parts.push(`feedback: "${String(details.feedback).slice(0, 30)}"`);
  return parts.join(" ");
}
