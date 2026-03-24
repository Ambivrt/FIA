// fia watch – Mini-dashboard med live-uppdatering

import { Command } from "commander";
import chalk from "chalk";
import { apiGet } from "../lib/api-client";
import { subscribeToActivityLog, unsubscribe } from "../lib/realtime";
import { statusBadge, relativeTime, progressBar, EARTH, GRADIENT, agentLabel } from "../lib/formatters";
import type {
  AgentResponse,
  KillSwitchStatus,
  ActivityLogEntry,
  PaginatedResponse,
  TaskResponse,
  PendingTrigger,
} from "../types";
import type { DisplayStatusResult } from "../types";

// Buffra senaste aktivitetshändelserna
const recentActivity: ActivityLogEntry[] = [];
const MAX_RECENT = 5;

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Live mini-dashboard (Ctrl+C to stop)")
    .action(async () => {
      let running = true;

      // Prenumerera på realtidshändelser
      subscribeToActivityLog((entry: ActivityLogEntry) => {
        recentActivity.unshift(entry);
        if (recentActivity.length > MAX_RECENT) recentActivity.pop();
      });

      const cleanup = (): void => {
        running = false;
        unsubscribe();
        // Återställ terminal
        process.stdout.write("\x1B[?25h"); // Visa markör
        process.stdout.write(chalk.dim("\nStopped.\n"));
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Dölj markör
      process.stdout.write("\x1B[?25l");

      while (running) {
        try {
          await render();
        } catch {
          // Ignorera tillfälliga fel
        }
        await sleep(2000);
      }
    });
}

async function render(): Promise<void> {
  const [agentsRes, killRes, tasksRes, triggersRes] = await Promise.all([
    apiGet<AgentResponse[]>("/api/agents"),
    apiGet<KillSwitchStatus>("/api/kill-switch/status"),
    apiGet<TaskResponse[]>("/api/tasks", { status: "queued,in_progress", per_page: "20" }) as Promise<
      PaginatedResponse<TaskResponse>
    >,
    apiGet<PendingTrigger[]>("/api/triggers/pending").catch(() => ({ data: [] as PendingTrigger[] })),
  ]);

  const agents = agentsRes.data;
  const killSwitch = killRes.data;
  const runningTasks = tasksRes.data;
  const pendingTriggerCount = (triggersRes as { data: PendingTrigger[] }).data.length;

  const now = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const runningCount = runningTasks.filter((t) => t.status === "in_progress").length;
  const queuedCount = runningTasks.filter((t) => t.status === "queued").length;

  // Rensa terminal
  process.stdout.write("\x1B[2J\x1B[H");

  // Header med Forefront Earth-färger
  const killLine = killSwitch.active ? chalk.red("● ON") : chalk.green("● OFF");
  const titleText = GRADIENT.orange("FIA") + EARTH.stone(" Watch");
  const border =
    EARTH.plum("\u256D\u2500 ") +
    titleText +
    EARTH.plum(" " + "\u2500".repeat(28) + " " + chalk.dim(now) + " \u2500\u256E");
  const borderBottom = EARTH.plum("\u2570" + "\u2500".repeat(40) + " Ctrl+C to exit " + "\u2500\u2570");

  process.stdout.write(border + "\n");
  process.stdout.write(EARTH.plum("\u2502") + "\n");
  const triggerLine =
    pendingTriggerCount > 0 ? chalk.yellow(`⏳ ${pendingTriggerCount} pending`) : chalk.dim("0 pending");

  process.stdout.write(
    EARTH.plum("\u2502") +
      `  ${EARTH.stone("Kill Switch:")} ${killLine}        ${EARTH.stone("Queue:")} ${runningCount}/${runningCount + queuedCount} running\n`,
  );
  process.stdout.write(
    EARTH.plum("\u2502") +
      `  ${EARTH.stone("Triggers:")}    ${triggerLine}` +
      (pendingTriggerCount > 0 ? chalk.dim("  → fia triggers approve") : "") +
      "\n",
  );
  process.stdout.write(EARTH.plum("\u2502") + "\n");

  // Agenter
  for (const agent of agents) {
    const ds = agent.display_status as unknown as DisplayStatusResult;
    const badge = statusBadge(ds);
    const hb = relativeTime(agent.last_heartbeat);

    // Hitta pågående task för agenten
    const agentTask = runningTasks.find((t) => t.agents?.slug === agent.slug && t.status === "in_progress");

    let taskInfo = chalk.dim("idle");
    if (agentTask) {
      taskInfo = progressBar(0.5) + " " + agentTask.type;
    } else if (ds.status === "paused") {
      taskInfo = chalk.dim("\u2014");
    }

    const label = agentLabel(agent.slug, agent.name);
    process.stdout.write(
      EARTH.plum("\u2502") + `  ${badge.padEnd(28)} ${label.padEnd(26)} ${chalk.dim("\u2665")} ${hb.padEnd(8)} ${taskInfo}\n`,
    );
  }

  // Senaste aktivitet
  if (recentActivity.length > 0) {
    process.stdout.write(EARTH.plum("\u2502") + "\n");
    process.stdout.write(EARTH.plum("\u2502") + chalk.bold("  Recent:") + "\n");
    for (const entry of recentActivity) {
      const time = new Date(entry.created_at).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const agent = entry.agents?.slug ?? "system";
      const details = entry.details_json ?? {};
      const extra = details.type ? String(details.type) : "";
      process.stdout.write(
        EARTH.plum("\u2502") + `  ${chalk.dim(time)}  ${agent.padEnd(12)} ${entry.action.padEnd(18)} ${extra}\n`,
      );
    }
  }

  process.stdout.write(EARTH.plum("\u2502") + "\n");
  process.stdout.write(borderBottom + "\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
