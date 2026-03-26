// fia costs – Kostnadsöversikt (MTD)

import { Command } from "commander";
import chalk from "chalk";
import { apiGet } from "../lib/api-client";
import { box, EARTH, GRADIENT } from "../lib/formatters";

interface MetricsSummary {
  content_this_week: number;
  approval_rate: number;
  pending_approvals: number;
  cost_mtd_sek: number;
  cost_trend: number;
}

export function registerCostsCommand(program: Command): void {
  program
    .command("costs")
    .description("Show cost overview (month-to-date)")
    .action(async () => {
      const { data } = await apiGet<MetricsSummary>("/api/metrics/summary");

      const trendArrow = data.cost_trend > 0 ? chalk.red("↑") : data.cost_trend < 0 ? chalk.green("↓") : "→";
      const trendPct = `${Math.abs(Math.round(data.cost_trend * 100))}%`;
      const approvalPct = `${Math.round(data.approval_rate * 100)}%`;

      const lines: string[] = [];
      lines.push(`  ${EARTH.stone("Kostnad MTD:")}    ${GRADIENT.orange.bold(`${data.cost_mtd_sek.toFixed(1)} kr`)} ${trendArrow} ${chalk.dim(trendPct + " vs förra mån")}`);
      lines.push(`  ${EARTH.stone("Content (vecka):")} ${chalk.white.bold(String(data.content_this_week))} publicerade`);
      lines.push(`  ${EARTH.stone("Godkännandegrad:")} ${chalk.white.bold(approvalPct)} ${chalk.dim("(30 dagar)")}`);
      lines.push(`  ${EARTH.stone("Väntande:")}`
        + `       ${data.pending_approvals > 0 ? chalk.yellow.bold(String(data.pending_approvals)) : chalk.green("0")} approvals`);

      process.stdout.write(box(lines.join("\n"), "FIA Costs") + "\n");
    });
}
