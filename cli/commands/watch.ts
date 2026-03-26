// fia watch – Mini-dashboard med live-uppdatering

import { Command } from "commander";
import chalk from "chalk";
import { apiGet, ApiClientError } from "../lib/api-client";
import { subscribeToActivityLog, subscribeToTaskChanges, unsubscribe } from "../lib/realtime";
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
import type { TaskChange } from "../lib/realtime";

// Buffra senaste aktivitetshändelserna
const recentActivity: ActivityLogEntry[] = [];
const MAX_RECENT = 5;

// Live task status cache (updated via Supabase Realtime)
const taskStatusCache = new Map<string, { status: string; sub_status: string | null }>();

// Map sub_status to approximate progress ratio
const SUB_STATUS_PROGRESS: Record<string, number> = {
  researching: 0.2,
  gathering: 0.2,
  analyzing: 0.4,
  compiling: 0.4,
  drafting: 0.6,
  generating: 0.3,
  screening: 0.5,
  revising: 0.6,
  brand_reviewing: 0.7,
  text_review: 0.7,
  visual_review: 0.7,
  aligning: 0.8,
  awaiting_input: 0.5,
};

// Flag to trigger immediate re-render on realtime events
let needsRerender = false;

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
        needsRerender = true;
      });

      // Prenumerera på task-statusändringar för snabbare uppdatering
      subscribeToTaskChanges((task: TaskChange) => {
        taskStatusCache.set(task.id, {
          status: task.status,
          sub_status: task.sub_status,
        });
        needsRerender = true;
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
        } catch (err) {
          if (err instanceof ApiClientError && err.code === "RATE_LIMIT") {
            process.stderr.write(chalk.yellow("\n⚠ Rate limited – retrying…\n"));
          }
        }

        // Wait up to 10s, but re-render immediately on realtime events
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline && running) {
          if (needsRerender) {
            needsRerender = false;
            break;
          }
          await sleep(200);
        }
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

  // Merge realtime cache into polled tasks for fresher sub_status
  for (const task of runningTasks) {
    const cached = taskStatusCache.get(task.id);
    if (cached) {
      task.status = cached.status;
      task.sub_status = cached.sub_status;
    }
  }

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
    const badge = statusBadge(ds, 10);
    const hb = relativeTime(agent.last_heartbeat);

    // Hitta pågående task för agenten
    const agentTask = runningTasks.find((t) => t.agents?.slug === agent.slug && t.status === "in_progress");

    let taskInfo = chalk.dim("idle");
    if (agentTask) {
      const subStatus = agentTask.sub_status;
      const progressRatio = subStatus ? (SUB_STATUS_PROGRESS[subStatus] ?? 0.5) : 0.5;
      const bar = progressBar(progressRatio);
      const subLabel = subStatus ? chalk.dim(` [${subStatus}]`) : "";
      taskInfo = bar + " " + agentTask.type + subLabel;
    } else if (ds.status === "paused") {
      taskInfo = chalk.dim("\u2014");
    }

    const label = agentLabel(agent.slug, agent.name, 22);
    process.stdout.write(
      EARTH.plum("\u2502") + `  ${label} ${badge} ${chalk.dim("\u2665")} ${hb.padEnd(8)} ${taskInfo}\n`,
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
