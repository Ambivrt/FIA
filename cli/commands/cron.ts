// fia cron [...] – Hantera schemalagda cron-jobb
//
// Subkommandon:
//   fia cron                         – Lista alla schemalagda jobb
//   fia cron create --agent <slug> --cron "<expr>" --task-type <type> --title "<titel>"
//   fia cron edit <id> [--cron "..."] [--title "..."] [--priority ...] ...
//   fia cron delete <id> [--yes]     – Ta bort jobb
//   fia cron enable <id>             – Aktivera jobb
//   fia cron disable <id>            – Inaktivera jobb

import { Command } from "commander";
import chalk from "chalk";
import {
  createTable,
  shortId,
  relativeTime,
  successMsg,
  errorMsg,
  EARTH,
} from "../lib/formatters";
import { getSupabaseClient } from "../lib/supabase";
import {
  listScheduledJobs,
  getScheduledJob,
  createScheduledJob,
  updateScheduledJob,
  deleteScheduledJob,
  enableScheduledJob,
  disableScheduledJob,
  resolveAgentBySlug,
  resolveJobId,
  CronServiceError,
} from "../../src/shared/cron-service";

// ─── Priority badge ───────────────────────────────────────────────────────────

function priorityBadge(p: string): string {
  switch (p) {
    case "critical":
      return chalk.red(p);
    case "high":
      return chalk.yellow(p);
    case "low":
      return chalk.dim(p);
    default:
      return chalk.white(p);
  }
}

// ─── Enabled badge ────────────────────────────────────────────────────────────

function enabledBadge(enabled: boolean): string {
  return enabled ? chalk.green("✓ on") : chalk.dim("✗ off");
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleError(err: unknown): never {
  if (err instanceof CronServiceError) {
    errorMsg(err.message);
  } else {
    errorMsg((err as Error).message);
  }
  process.exit(1);
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerCronCommand(program: Command): void {
  const cronCmd = program
    .command("cron")
    .description("Manage scheduled cron jobs")
    .option("--agent <slug>", "Filter by agent slug")
    .action(async (opts: { agent?: string }) => {
      try {
        await listJobs(opts.agent);
      } catch (err) {
        handleError(err);
      }
    });

  // ── cron create ───────────────────────────────────────────────────────────
  cronCmd
    .command("create")
    .description("Create a new scheduled cron job")
    .requiredOption("--agent <slug>", "Agent slug (e.g. analytics, content)")
    .requiredOption("--cron <expression>", "Cron expression (e.g. \"0 7 * * 1-5\")")
    .requiredOption("--task-type <type>", "Task type (e.g. morning_pulse)")
    .requiredOption("--title <title>", "Job title")
    .option("--priority <priority>", "Priority: critical, high, normal, low", "normal")
    .option("--description <text>", "Job description")
    .option("--disabled", "Create in disabled state")
    .action(
      async (opts: {
        agent: string;
        cron: string;
        taskType: string;
        title: string;
        priority: string;
        description?: string;
        disabled?: boolean;
      }) => {
        try {
          const sb = getSupabaseClient();
          const agent = await resolveAgentBySlug(sb, opts.agent);

          process.stdout.write(chalk.dim("Creating scheduled job...\n"));

          const job = await createScheduledJob(
            sb,
            {
              agent_id: agent.id,
              cron_expression: opts.cron,
              task_type: opts.taskType,
              title: opts.title,
              priority: opts.priority,
              description: opts.description,
              enabled: !opts.disabled,
            },
            "cli",
          );

          successMsg(
            `Job created: ${shortId(job.id)} – ${opts.agent}/${opts.taskType} "${opts.title}" [${opts.cron}]`,
          );
        } catch (err) {
          handleError(err);
        }
      },
    );

  // ── cron edit ─────────────────────────────────────────────────────────────
  cronCmd
    .command("edit <id>")
    .description("Edit a scheduled cron job")
    .option("--cron <expression>", "New cron expression")
    .option("--task-type <type>", "New task type")
    .option("--title <title>", "New title")
    .option("--priority <priority>", "New priority")
    .option("--description <text>", "New description")
    .option("--agent <slug>", "Change agent")
    .action(
      async (
        id: string,
        opts: {
          cron?: string;
          taskType?: string;
          title?: string;
          priority?: string;
          description?: string;
          agent?: string;
        },
      ) => {
        try {
          const sb = getSupabaseClient();

          const updates: Record<string, unknown> = {};
          if (opts.cron) updates.cron_expression = opts.cron;
          if (opts.taskType) updates.task_type = opts.taskType;
          if (opts.title) updates.title = opts.title;
          if (opts.priority) updates.priority = opts.priority;
          if (opts.description) updates.description = opts.description;
          if (opts.agent) {
            const agent = await resolveAgentBySlug(sb, opts.agent);
            updates.agent_id = agent.id;
          }

          if (Object.keys(updates).length === 0) {
            errorMsg("Ange minst ett fält att ändra (--cron, --title, --priority, etc.)");
            process.exit(1);
          }

          process.stdout.write(chalk.dim(`Updating job ${shortId(id)}...\n`));
          const job = await updateScheduledJob(sb, id, updates, "cli");

          const agentSlug = job.agents?.slug ?? "unknown";
          successMsg(`Job updated: ${shortId(job.id)} – ${agentSlug}/${job.task_type} "${job.title}"`);
        } catch (err) {
          handleError(err);
        }
      },
    );

  // ── cron delete ───────────────────────────────────────────────────────────
  cronCmd
    .command("delete <id>")
    .description("Delete a scheduled cron job")
    .option("--yes", "Skip confirmation")
    .action(async (id: string, opts: { yes?: boolean }) => {
      try {
        const sb = getSupabaseClient();
        const job = await getScheduledJob(sb, id);
        const agentSlug = job.agents?.slug ?? "unknown";

        if (!opts.yes) {
          process.stdout.write(
            chalk.yellow(
              `\nÄr du säker att du vill ta bort jobb ${shortId(job.id)}?\n` +
                `  Agent: ${agentSlug}\n` +
                `  Titel: ${job.title}\n` +
                `  Cron:  ${job.cron_expression}\n\n` +
                `Kör med --yes för att bekräfta.\n`,
            ),
          );
          process.exit(0);
        }

        process.stdout.write(chalk.dim(`Deleting job ${shortId(job.id)}...\n`));
        await deleteScheduledJob(sb, job.id, "cli");
        successMsg(`Job deleted: ${shortId(job.id)} – ${agentSlug} "${job.title}"`);
      } catch (err) {
        handleError(err);
      }
    });

  // ── cron enable ───────────────────────────────────────────────────────────
  cronCmd
    .command("enable <id>")
    .description("Enable a scheduled cron job")
    .action(async (id: string) => {
      try {
        const sb = getSupabaseClient();
        const job = await enableScheduledJob(sb, id, "cli");
        const agentSlug = job.agents?.slug ?? "unknown";
        successMsg(`Job enabled: ${shortId(job.id)} – ${agentSlug} "${job.title}"`);
      } catch (err) {
        handleError(err);
      }
    });

  // ── cron disable ──────────────────────────────────────────────────────────
  cronCmd
    .command("disable <id>")
    .description("Disable a scheduled cron job")
    .action(async (id: string) => {
      try {
        const sb = getSupabaseClient();
        const job = await disableScheduledJob(sb, id, "cli");
        const agentSlug = job.agents?.slug ?? "unknown";
        successMsg(`Job disabled: ${shortId(job.id)} – ${agentSlug} "${job.title}"`);
      } catch (err) {
        handleError(err);
      }
    });
}

// ─── List jobs ────────────────────────────────────────────────────────────────

async function listJobs(agentFilter?: string): Promise<void> {
  const sb = getSupabaseClient();
  let jobs = await listScheduledJobs(sb);

  if (agentFilter) {
    jobs = jobs.filter((j) => j.agents?.slug === agentFilter);
  }

  if (jobs.length === 0) {
    const filter = agentFilter ? ` for agent '${agentFilter}'` : "";
    process.stdout.write(chalk.dim(`No scheduled jobs${filter}.\n`));
    return;
  }

  const table = createTable(
    ["ID", "Agent", "Cron", "Task Type", "Title", "Priority", "Active", "Last Run"],
    [8, 12, 18, 18, 24, 10, 8, 10],
  );

  for (const job of jobs) {
    const agentSlug = job.agents?.slug ?? "—";
    table.push([
      chalk.dim(shortId(job.id)),
      EARTH.plum(agentSlug),
      chalk.white(job.cron_expression),
      chalk.dim(job.task_type),
      job.title,
      priorityBadge(job.priority),
      enabledBadge(job.enabled),
      relativeTime(job.last_triggered_at),
    ]);
  }

  process.stdout.write(`\n${EARTH.slate(chalk.bold("Scheduled Jobs"))} (${jobs.length})\n`);
  process.stdout.write(table.toString() + "\n\n");
}
