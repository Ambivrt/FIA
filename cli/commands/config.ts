// fia config [agent] [--routing] [--tools] – Visa eller redigera agentkonfiguration
// fia config reseed [agent] [--confirm]   – Reseed routing från YAML

import { Command } from "commander";
import chalk from "chalk";
import { apiGet, apiPatch, apiPost } from "../lib/api-client";
import { successMsg, warnMsg } from "../lib/formatters";
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

  // ── config reseed ─────────────────────────────────────────────────────────
  const configCmd = program.commands.find((c) => c.name() === "config");
  if (configCmd) {
    configCmd
      .command("reseed [agent]")
      .description("Reseed routing configuration from agent.yaml (dry-run by default)")
      .option("--confirm", "Apply reseed (skips dry-run prompt)")
      .action(async (slug?: string, opts?: { confirm?: boolean }) => {
        if (slug) {
          await reseedAgentRouting(slug, !!opts?.confirm);
        } else {
          await reseedAllRouting(!!opts?.confirm);
        }
      });
  }
}

// ─── Reseed routing (all agents) ──────────────────────────────────────────────

async function reseedAllRouting(confirm: boolean): Promise<void> {
  if (!confirm) {
    process.stdout.write(chalk.dim("Running routing dry-run diff (all agents)...\n\n"));
    const res = await apiPost<{
      dry_run: boolean;
      agents: Array<{
        slug: string;
        current_route_count: number;
        yaml_route_count: number;
        changes: Array<{ task_type: string; diff: string }>;
      }>;
    }>("/api/agents/routing/reseed", { confirm: false });

    const result = res.data as unknown as (typeof res)["data"];
    renderRoutingReseedDiff(result.agents);

    const hasChanges = result.agents.some((a) => a.changes.length > 0);
    if (!hasChanges) {
      successMsg("All routing is in sync with agent.yaml.");
      return;
    }

    warnMsg("Run with --confirm to apply changes, or use the Dashboard.");
    return;
  }

  process.stdout.write(chalk.dim("Reseeding all agent routing from agent.yaml...\n"));
  const res = await apiPost<{ reseeded: string[]; unchanged: string[]; message: string }>(
    "/api/agents/routing/reseed",
    {
      confirm: true,
    },
  );

  const result = res.data as unknown as (typeof res)["data"];
  successMsg(result.message);
  if (result.reseeded.length > 0) {
    process.stdout.write(chalk.dim(`  Reseeded: ${result.reseeded.join(", ")}\n`));
  }
  if (result.unchanged.length > 0) {
    process.stdout.write(chalk.dim(`  Unchanged: ${result.unchanged.join(", ")}\n`));
  }
}

// ─── Reseed routing (single agent) ────────────────────────────────────────────

async function reseedAgentRouting(slug: string, confirm: boolean): Promise<void> {
  if (!confirm) {
    process.stdout.write(chalk.dim(`Running routing dry-run diff for agent '${slug}'...\n\n`));
    const res = await apiPost<{
      dry_run: boolean;
      agents: Array<{
        slug: string;
        current_route_count: number;
        yaml_route_count: number;
        changes: Array<{ task_type: string; diff: string }>;
      }>;
    }>(`/api/agents/${slug}/routing/reseed`, { confirm: false });

    const result = res.data as unknown as (typeof res)["data"];
    renderRoutingReseedDiff(result.agents);

    const hasChanges = result.agents.some((a) => a.changes.length > 0);
    if (!hasChanges) {
      successMsg(`'${slug}' routing is in sync with agent.yaml.`);
      return;
    }

    warnMsg("Run with --confirm to apply changes.");
    return;
  }

  process.stdout.write(chalk.dim(`Reseeding routing for agent '${slug}'...\n`));
  const res = await apiPost<{ reseeded: string[]; unchanged: string[]; message: string }>(
    `/api/agents/${slug}/routing/reseed`,
    { confirm: true },
  );

  const result = res.data as unknown as (typeof res)["data"];
  successMsg(result.message ?? `Routing reseeded for ${slug}.`);
}

function renderRoutingReseedDiff(
  agents: Array<{
    slug: string;
    current_route_count: number;
    yaml_route_count: number;
    changes: Array<{ task_type: string; diff: string }>;
  }>,
): void {
  for (const agent of agents) {
    process.stdout.write(
      chalk.bold(agent.slug) + chalk.dim(` (${agent.current_route_count} → ${agent.yaml_route_count} routes)\n`),
    );
    if (agent.changes.length === 0) {
      process.stdout.write(chalk.green("  ✓ In sync\n"));
    } else {
      for (const change of agent.changes) {
        process.stdout.write(`  ${chalk.yellow(change.task_type.padEnd(20))} ${change.diff}\n`);
      }
    }
    process.stdout.write("\n");
  }
}
