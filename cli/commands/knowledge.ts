// fia knowledge [list|reseed] – Hantera kunskapsbas

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { apiGet, apiPost } from "../lib/api-client";
import { createTable, EARTH, GRADIENT, successMsg, errorMsg, warnMsg } from "../lib/formatters";

interface KnowledgeItem {
  id: string;
  agent_slug: string;
  category: string;
  task_type: string | null;
  slug: string;
  title: string;
  description: string;
  enabled: boolean;
  source: string;
  version: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ReseedDiff {
  slug: string;
  added: number;
  updated: number;
  unchanged: number;
  total: number;
}

export function registerKnowledgeCommand(program: Command): void {
  const knowledge = program.command("knowledge").description("Manage the agent knowledge base");

  // fia knowledge list
  knowledge
    .command("list")
    .description("List knowledge items")
    .option("--agent <slug>", "Filter by agent slug")
    .option("--category <cat>", "Filter by category (skill, system_context, task_context, few_shot, memory)")
    .action(async (opts: { agent?: string; category?: string }) => {
      const params: Record<string, string> = {};
      if (opts.agent) params.agent_slug = opts.agent;
      if (opts.category) params.category = opts.category;

      const { data: items } = await apiGet<KnowledgeItem[]>("/api/knowledge", params);

      if (items.length === 0) {
        warnMsg("Inga knowledge items hittades.");
        return;
      }

      const table = createTable(["Agent", "Kategori", "Titel", "Aktiv", "Källa", "Ver"]);

      for (const item of items) {
        table.push([
          EARTH.forest(item.agent_slug),
          EARTH.slate(item.category),
          item.title.length > 40 ? item.title.slice(0, 37) + "..." : item.title,
          item.enabled ? chalk.green("✓") : chalk.red("✗"),
          chalk.dim(item.source),
          chalk.dim(String(item.version)),
        ]);
      }

      process.stdout.write(
        GRADIENT.orange.bold(`Knowledge Base`) + EARTH.stone(` (${items.length} items)`) + "\n\n",
      );
      process.stdout.write(table.toString() + "\n");
    });

  // fia knowledge reseed
  knowledge
    .command("reseed")
    .description("Reseed knowledge from server YAML files")
    .option("--agent <slug>", "Reseed only a specific agent")
    .option("--confirm", "Execute reseed (without this flag, dry-run is shown)")
    .action(async (opts: { agent?: string; confirm?: boolean }) => {
      const confirm = opts.confirm === true;
      const body: Record<string, unknown> = { confirm };
      if (opts.agent) body.agent_slug = opts.agent;

      if (!confirm) {
        process.stdout.write(EARTH.slate("Dry run — inga ändringar görs\n\n"));
      }

      const spinner = ora("Kontrollerar knowledge-ändringar...").start();

      try {
        const { data } = await apiPost<{ dry_run: boolean; agents: ReseedDiff[]; message?: string }>(
          "/api/knowledge/reseed",
          body,
        );

        spinner.stop();

        if (data.dry_run) {
          const table = createTable(["Agent", "Nya", "Uppdaterade", "Oförändrade", "Totalt"]);
          for (const d of data.agents as ReseedDiff[]) {
            table.push([
              EARTH.forest(d.slug),
              d.added > 0 ? chalk.green(String(d.added)) : "0",
              d.updated > 0 ? chalk.yellow(String(d.updated)) : "0",
              chalk.dim(String(d.unchanged)),
              String(d.total),
            ]);
          }
          process.stdout.write(table.toString() + "\n\n");
          process.stdout.write(chalk.dim("Kör med --confirm för att genomföra.\n"));
        } else {
          successMsg(data.message ?? "Knowledge reseed klar.");
        }
      } catch (err) {
        spinner.fail("Knowledge reseed misslyckades");
        errorMsg((err as Error).message);
        process.exit(1);
      }
    });
}
