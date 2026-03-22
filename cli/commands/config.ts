// fia config [agent] [--routing] [--tools] – Visa eller redigera agentkonfiguration

import { Command } from "commander";
import chalk from "chalk";
import { apiGet, apiPatch } from "../lib/api-client";
import { successMsg } from "../lib/formatters";
import type { AgentResponse } from "../types";

export function registerConfigCommand(program: Command): void {
  program
    .command("config [agent]")
    .description("View or edit agent configuration")
    .option("--routing [assignment]", "Show or set routing (e.g. metadata=claude-opus)")
    .option("--tools", "Show tools configuration")
    .action(async (slug?: string, opts?: { routing?: string | boolean; tools?: boolean }) => {
      const { data: agents } = await apiGet<AgentResponse[]>("/api/agents");

      if (!slug) {
        // Lista alla agenter med routing-info
        for (const agent of agents) {
          const config = agent.config_json ?? {};
          const routing = config.routing as Record<string, unknown> | undefined;
          const defaultModel = routing?.default ?? "—";
          process.stdout.write(`${chalk.bold(agent.slug.padEnd(14))} default: ${defaultModel}\n`);
        }
        return;
      }

      const agent = agents.find((a) => a.slug === slug);
      if (!agent) {
        process.stderr.write(`Error: Agent '${slug}' not found.\n`);
        process.exit(1);
      }

      const config = agent.config_json ?? {};

      // Redigera routing: --routing metadata=claude-opus
      if (typeof opts?.routing === "string" && opts.routing.includes("=")) {
        const [taskType, model] = opts.routing.split("=");
        const currentRouting = (config.routing as Record<string, unknown>) ?? {};
        const newRouting = { ...currentRouting, [taskType]: model };

        await apiPatch(`/api/agents/${slug}/routing`, { routing: newRouting });
        successMsg(`Updated ${slug} routing: ${taskType} = ${model}`);
        return;
      }

      // Visa routing
      if (opts?.routing !== undefined || (!opts?.tools && !opts?.routing)) {
        const routing = config.routing as Record<string, unknown> | undefined;
        if (routing) {
          process.stdout.write(chalk.bold(`${slug} routing:\n`));
          for (const [task, model] of Object.entries(routing)) {
            const modelStr = typeof model === "object" ? JSON.stringify(model) : String(model);
            process.stdout.write(`  ${task.padEnd(16)} ${modelStr}\n`);
          }
        } else {
          process.stdout.write("No routing configuration.\n");
        }
      }

      // Visa tools
      if (opts?.tools) {
        const tools = config.tools as string[] | undefined;
        if (tools && tools.length > 0) {
          process.stdout.write(chalk.bold(`\n${slug} tools:\n`));
          for (const tool of tools) {
            process.stdout.write(`  ${tool}\n`);
          }
        } else {
          process.stdout.write("No tools configuration.\n");
        }
      }
    });
}
