// fia agents [slug] – Agenttabell eller detaljvy

import { Command } from "commander";
import chalk from "chalk";
import { apiGet } from "../lib/api-client";
import { statusBadge, relativeTime, createTable } from "../lib/formatters";
import type { AgentResponse, TaskResponse, PaginatedResponse } from "../types";
import type { DisplayStatusResult } from "../types";

export function registerAgentsCommand(program: Command): void {
  program
    .command("agents [slug]")
    .description("List all agents or show details for a specific agent")
    .option("--verbose", "Show full details")
    .action(async (slug?: string, _opts?: { verbose?: boolean }) => {
      const { data: agents } = await apiGet<AgentResponse[]>("/api/agents");

      if (slug) {
        const agent = agents.find((a) => a.slug === slug);
        if (!agent) {
          process.stderr.write(`Error: Agent '${slug}' not found.\n`);
          process.exit(1);
        }

        // Detaljvy
        const ds = agent.display_status as unknown as DisplayStatusResult;
        process.stdout.write(chalk.bold(`\n${agent.name}`) + ` (${agent.slug})\n`);
        process.stdout.write(`Status:    ${statusBadge(ds)}\n`);
        process.stdout.write(`Autonomy:  ${agent.autonomy_level}\n`);
        process.stdout.write(`Heartbeat: ${relativeTime(agent.last_heartbeat)}\n`);

        // Routing från config_json
        const config = agent.config_json ?? {};
        if (config.routing) {
          process.stdout.write(chalk.bold("\nRouting:\n"));
          const routing = config.routing as Record<string, unknown>;
          for (const [task, model] of Object.entries(routing)) {
            process.stdout.write(`  ${task.padEnd(16)} ${model}\n`);
          }
        }

        // Tools
        if (config.tools) {
          process.stdout.write(chalk.bold("\nTools:\n"));
          const tools = config.tools as string[];
          for (const tool of tools) {
            process.stdout.write(`  ${tool}\n`);
          }
        }

        // Senaste tasks
        const { data: tasks } = await apiGet<TaskResponse[]>("/api/tasks", {
          agent_slug: slug,
          per_page: "5",
          sort: "-created_at",
        }) as PaginatedResponse<TaskResponse>;

        if (tasks.length > 0) {
          process.stdout.write(chalk.bold("\nRecent tasks:\n"));
          const table = createTable(["Type", "Status", "Created"]);
          for (const task of tasks) {
            table.push([task.type, task.status, relativeTime(task.created_at)]);
          }
          process.stdout.write(table.toString() + "\n");
        }

        process.stdout.write("\n");
        return;
      }

      // Tabelläge
      const table = createTable(["Agent", "Status", "Heartbeat", "Tasks", "Autonomy"]);

      for (const agent of agents) {
        const ds = agent.display_status as unknown as DisplayStatusResult;
        const totalDone = Object.entries(agent.tasks_today)
          .filter(([k]) => k !== "queued" && k !== "in_progress")
          .reduce((sum, [, v]) => sum + v, 0);

        table.push([
          statusBadge(ds) + " " + agent.slug,
          ds.label.toLowerCase(),
          relativeTime(agent.last_heartbeat),
          `${totalDone} done`,
          agent.autonomy_level,
        ]);
      }

      process.stdout.write(table.toString() + "\n");
    });
}
