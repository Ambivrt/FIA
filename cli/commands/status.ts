// fia status – Systemöversikt i boxen-ram

import { Command } from "commander";
import chalk from "chalk";
import { apiGet } from "../lib/api-client";
import { statusBadge, relativeTime, box, EARTH, agentLabel } from "../lib/formatters";
import type { AgentResponse, KillSwitchStatus } from "../types";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show FIA system status overview")
    .action(async () => {
      const [agentsRes, killRes] = await Promise.all([
        apiGet<AgentResponse[]>("/api/agents"),
        apiGet<KillSwitchStatus>("/api/kill-switch/status"),
      ]);

      const agents = agentsRes.data;
      const killSwitch = killRes.data;

      // Beräkna kö-statistik
      let queued = 0;
      let running = 0;
      for (const agent of agents) {
        running += agent.running_task_count;
        queued += agent.tasks_today["queued"] ?? 0;
      }

      // Kill switch-rad
      const killLine = killSwitch.active
        ? chalk.red("● ON") +
          (killSwitch.activated_at ? chalk.gray(`  since ${relativeTime(killSwitch.activated_at)}`) : "")
        : chalk.green("● OFF");

      // Bygg innehåll
      const lines: string[] = [];
      lines.push(`  ${EARTH.stone("Kill Switch:")}  ${killLine}`);
      lines.push(`  ${EARTH.stone("Queue:")}        ${queued} queued / ${running} running`);
      lines.push("");
      lines.push(EARTH.slate("  Agents:"));

      for (const agent of agents) {
        const ds = agent.display_status;
        const badge = statusBadge(
          ds as {
            status: "online" | "working" | "paused" | "killed" | "error";
            label: string;
            labelSv: string;
            color: string;
            symbol: string;
          },
          10,
        );
        const hb = relativeTime(agent.last_heartbeat);
        const taskInfo =
          agent.running_task_count > 0
            ? chalk.dim(Object.keys(agent.tasks_today).find((k) => k === "in_progress") ? "" : "")
            : "";

        const label = agentLabel(agent.slug, agent.name, 22);
        const line = `  ${label} ${badge} ${chalk.dim("\u2665")} ${hb.padEnd(10)} ${taskInfo}`;
        lines.push(line);
      }

      process.stdout.write(box(lines.join("\n"), "FIA System Status") + "\n");
    });
}
