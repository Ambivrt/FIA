// fia triggers [...] – Hantera deklarativa triggers och pending trigger-kö
//
// Subkommandon:
//   fia triggers                         – Lista pending triggers
//   fia triggers approve <id>            – Godkänn pending trigger
//   fia triggers reject <id> --reason    – Avslå pending trigger
//   fia triggers config [agent]          – Visa/ändra trigger-konfiguration
//   fia triggers reseed [agent]          – Reseed triggers från YAML

import { Command } from "commander";
import chalk from "chalk";
import { apiGet, apiPost, apiPatch } from "../lib/api-client";
import {
  createTable,
  shortId,
  relativeTime,
  successMsg,
  errorMsg,
  warnMsg,
  EARTH,
  GRADIENT,
  box,
} from "../lib/formatters";
import type { PendingTrigger, TriggerConfig, AgentResponse } from "../types";

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

// ─── Trigger status badge ─────────────────────────────────────────────────────

function triggerStatusBadge(status: string): string {
  switch (status) {
    case "pending":
      return chalk.yellow("⏳ pending");
    case "executed":
      return chalk.green("✓ executed");
    case "rejected":
      return chalk.red("✗ rejected");
    default:
      return chalk.dim(status);
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerTriggersCommand(program: Command): void {
  const triggers = program
    .command("triggers")
    .description("Manage declarative triggers and pending trigger queue")
    .option("--agent <slug>", "Filter by agent slug")
    .option("--status <status>", "Filter by status (pending|executed|rejected)", "pending")
    .action(async (opts: { agent?: string; status?: string }) => {
      await listTriggers(opts.agent, opts.status ?? "pending");
    });

  // ── triggers approve ────────────────────────────────────────────────────────
  triggers
    .command("approve <trigger-id>")
    .description("Approve a pending trigger (creates downstream task)")
    .option("--feedback <text>", "Optional feedback note")
    .action(async (triggerId: string, opts: { feedback?: string }) => {
      const fullId = await resolveTriggerIdOrExit(triggerId);

      process.stdout.write(chalk.dim(`Approving trigger ${shortId(fullId)}...\n`));
      const res = await apiPost<{ id: string; status: string; new_task_id: string }>(
        `/api/triggers/${fullId}/approve`,
        opts.feedback ? { feedback: opts.feedback } : undefined,
      );

      const d = res.data;
      successMsg(`Trigger approved. New task created: ${shortId(d.new_task_id)}`);
    });

  // ── triggers reject ─────────────────────────────────────────────────────────
  triggers
    .command("reject <trigger-id>")
    .description("Reject a pending trigger")
    .requiredOption("--reason <text>", "Reason for rejection")
    .action(async (triggerId: string, opts: { reason: string }) => {
      const fullId = await resolveTriggerIdOrExit(triggerId);

      process.stdout.write(chalk.dim(`Rejecting trigger ${shortId(fullId)}...\n`));
      await apiPost(`/api/triggers/${fullId}/reject`, { reason: opts.reason });
      successMsg(`Trigger ${shortId(fullId)} rejected.`);
    });

  // ── triggers config ─────────────────────────────────────────────────────────
  triggers
    .command("config [agent]")
    .description("View or toggle trigger configuration per agent")
    .option("--enable <name>", "Enable a trigger by name")
    .option("--disable <name>", "Disable a trigger by name")
    .action(async (slug?: string, opts?: { enable?: string; disable?: string }) => {
      if (slug && (opts?.enable || opts?.disable)) {
        await toggleTrigger(slug, opts.enable ? opts.enable : opts.disable!, !!opts.enable);
      } else {
        await showTriggerConfig(slug);
      }
    });

  // ── triggers reseed ─────────────────────────────────────────────────────────
  triggers
    .command("reseed [agent]")
    .description("Reseed trigger configuration from agent.yaml (dry-run by default)")
    .option("--confirm", "Apply reseed (skips dry-run prompt)")
    .action(async (slug?: string, opts?: { confirm?: boolean }) => {
      if (slug) {
        await reseedAgentTriggers(slug, !!opts?.confirm);
      } else {
        await reseedAllTriggers(!!opts?.confirm);
      }
    });
}

// ─── List pending triggers ────────────────────────────────────────────────────

async function listTriggers(agentFilter?: string, statusFilter = "pending"): Promise<void> {
  const { data: pending } = await apiGet<PendingTrigger[]>("/api/triggers/pending");

  let items = pending;
  if (agentFilter) {
    items = items.filter((t) => t.target_agent_slug === agentFilter || t.tasks?.agents?.slug === agentFilter);
  }
  if (statusFilter !== "all") {
    items = items.filter((t) => t.status === statusFilter);
  }

  if (items.length === 0) {
    const filter = agentFilter ? ` for agent '${agentFilter}'` : "";
    process.stdout.write(chalk.dim(`No ${statusFilter} triggers${filter}.\n`));
    return;
  }

  const table = createTable(["ID", "Trigger", "From", "→ Target", "Priority", "Age"], [8, 28, 18, 22, 10, 10]);

  for (const t of items) {
    const sourceAgent = t.tasks?.agents?.slug ?? "—";
    const sourceTaskType = t.tasks?.type ?? "—";
    const from = `${EARTH.plum(sourceAgent)}/${chalk.dim(sourceTaskType)}`;
    const target = `${EARTH.forest(t.target_agent_slug)}/${chalk.dim(t.target_task_type)}`;

    table.push([
      chalk.dim(shortId(t.id)),
      GRADIENT.orange(t.trigger_name),
      from,
      target,
      priorityBadge(t.priority),
      relativeTime(t.created_at),
    ]);
  }

  process.stdout.write(
    EARTH.plum(`\n  Pending triggers (${items.length})\n`) +
      EARTH.stone("  Approve: ") +
      chalk.dim("fia triggers approve <id>\n\n"),
  );
  process.stdout.write(table.toString() + "\n");
}

// ─── Trigger config view ──────────────────────────────────────────────────────

async function showTriggerConfig(slug?: string): Promise<void> {
  if (slug) {
    const res = await apiGet<{ agent_slug: string; triggers: TriggerConfig[] }>(`/api/agents/${slug}/triggers`);
    const { agent_slug, triggers } = res.data as unknown as { agent_slug: string; triggers: TriggerConfig[] };
    renderTriggerTable(agent_slug, triggers);
  } else {
    // All agents
    const { data: agents } = await apiGet<AgentResponse[]>("/api/agents");
    for (const agent of agents) {
      const res = await apiGet<{ agent_slug: string; triggers: TriggerConfig[] }>(`/api/agents/${agent.slug}/triggers`);
      const { triggers } = res.data as unknown as { agent_slug: string; triggers: TriggerConfig[] };
      if (triggers.length > 0) {
        renderTriggerTable(agent.slug, triggers);
        process.stdout.write("\n");
      }
    }
  }
}

function renderTriggerTable(slug: string, triggers: TriggerConfig[]): void {
  if (triggers.length === 0) {
    process.stdout.write(`${EARTH.plum(slug)}: ${chalk.dim("no triggers configured")}\n`);
    return;
  }

  process.stdout.write(EARTH.plum(`\n  ${slug} triggers:\n\n`));

  const table = createTable(["Name", "On", "Condition", "→ Action", "Enabled", "Approval"], [28, 18, 22, 22, 9, 10]);

  for (const t of triggers) {
    const condition = buildConditionSummary(t.condition);
    const action = buildActionSummary(t.action);
    const enabled = t.enabled ? chalk.green("✓ yes") : chalk.dim("✗ no");
    const approval = t.requires_approval ? chalk.yellow("required") : chalk.dim("auto");

    table.push([GRADIENT.orange(t.name), chalk.dim(t.on), chalk.dim(condition), action, enabled, approval]);
  }

  process.stdout.write(table.toString() + "\n");
}

function buildConditionSummary(cond?: TriggerConfig["condition"]): string {
  if (!cond) return "any";
  const parts: string[] = [];
  if (cond.task_type) {
    const types = Array.isArray(cond.task_type) ? cond.task_type.join("|") : cond.task_type;
    parts.push(`type:${types}`);
  }
  if (cond.score_field && cond.score_above != null) {
    parts.push(`${cond.score_field}>${cond.score_above}`);
  }
  if (cond.output_field && cond.output_value) {
    const v = Array.isArray(cond.output_value) ? cond.output_value.join("|") : cond.output_value;
    parts.push(`${cond.output_field}=${v}`);
  }
  return parts.length > 0 ? parts.join(", ") : "any";
}

function buildActionSummary(action: TriggerConfig["action"]): string {
  switch (action.type) {
    case "create_task":
      return `${EARTH.forest(action.target_agent ?? "?")}/${chalk.dim(action.task_type ?? "?")}`;
    case "notify_slack":
      return chalk.cyan(`#${action.channel ?? "?"}`);
    case "escalate":
      return chalk.yellow("escalate");
    default:
      return chalk.dim(action.type);
  }
}

// ─── Toggle trigger ───────────────────────────────────────────────────────────

async function toggleTrigger(slug: string, triggerName: string, enable: boolean): Promise<void> {
  process.stdout.write(chalk.dim(`${enable ? "Enabling" : "Disabling"} trigger '${triggerName}' on ${slug}...\n`));

  await apiPatch(`/api/agents/${slug}/triggers`, {
    triggers: [{ name: triggerName, enabled: enable }],
  });

  const verb = enable ? "enabled" : "disabled";
  successMsg(`Trigger '${triggerName}' ${verb} on ${slug}.`);
}

// ─── Reseed (all agents) ──────────────────────────────────────────────────────

async function reseedAllTriggers(confirm: boolean): Promise<void> {
  if (!confirm) {
    // Dry-run first
    process.stdout.write(chalk.dim("Running dry-run diff (all agents)...\n\n"));
    const res = await apiPost<{
      dry_run: boolean;
      agents: Array<{
        slug: string;
        current_trigger_count: number;
        yaml_trigger_count: number;
        changes: Array<{ trigger: string; diff: string }>;
      }>;
    }>("/api/triggers/reseed", { confirm: false });

    const result = res.data as unknown as (typeof res)["data"];
    renderReseedDiff(result.agents);

    const hasChanges = result.agents.some((a) => a.changes.length > 0);
    if (!hasChanges) {
      successMsg("All triggers are in sync with agent.yaml.");
      return;
    }

    warnMsg("Run with --confirm to apply changes, or use the Dashboard.");
    return;
  }

  process.stdout.write(chalk.dim("Reseeding all agent triggers from agent.yaml...\n"));
  const res = await apiPost<{ reseeded: string[]; unchanged: string[]; message: string }>("/api/triggers/reseed", {
    confirm: true,
  });

  const result = res.data as unknown as (typeof res)["data"];
  successMsg(result.message);
  if (result.reseeded.length > 0) {
    process.stdout.write(chalk.dim(`  Reseeded: ${result.reseeded.join(", ")}\n`));
  }
  if (result.unchanged.length > 0) {
    process.stdout.write(chalk.dim(`  Unchanged: ${result.unchanged.join(", ")}\n`));
  }
}

// ─── Reseed (single agent) ────────────────────────────────────────────────────

async function reseedAgentTriggers(slug: string, confirm: boolean): Promise<void> {
  if (!confirm) {
    process.stdout.write(chalk.dim(`Running dry-run diff for agent '${slug}'...\n\n`));
    const res = await apiPost<{
      dry_run: boolean;
      agents: Array<{
        slug: string;
        current_trigger_count: number;
        yaml_trigger_count: number;
        changes: Array<{ trigger: string; diff: string }>;
      }>;
    }>(`/api/agents/${slug}/triggers/reseed`, { confirm: false });

    const result = res.data as unknown as (typeof res)["data"];
    renderReseedDiff(result.agents);

    const hasChanges = result.agents.some((a) => a.changes.length > 0);
    if (!hasChanges) {
      successMsg(`'${slug}' triggers are in sync with agent.yaml.`);
      return;
    }

    warnMsg("Run with --confirm to apply changes.");
    return;
  }

  process.stdout.write(chalk.dim(`Reseeding triggers for agent '${slug}'...\n`));
  const res = await apiPost<{ reseeded: string[]; unchanged: string[]; message: string }>(
    `/api/agents/${slug}/triggers/reseed`,
    { confirm: true },
  );

  const result = res.data as unknown as (typeof res)["data"];
  successMsg(result.message ?? `Triggers reseeded for ${slug}.`);
}

function renderReseedDiff(
  agents: Array<{
    slug: string;
    current_trigger_count: number;
    yaml_trigger_count: number;
    changes: Array<{ trigger: string; diff: string }>;
  }>,
): void {
  for (const agent of agents) {
    const header = `${EARTH.plum(agent.slug)} (DB: ${agent.current_trigger_count} → YAML: ${agent.yaml_trigger_count})`;
    if (agent.changes.length === 0) {
      process.stdout.write(`  ${header} ${chalk.dim("– in sync")}\n`);
    } else {
      process.stdout.write(`  ${header}\n`);
      for (const change of agent.changes) {
        const icon = change.diff.startsWith("Ny") ? chalk.green("+") : chalk.yellow("~");
        process.stdout.write(`    ${icon} ${chalk.bold(change.trigger)}: ${chalk.dim(change.diff)}\n`);
      }
    }
  }
  process.stdout.write("\n");
}

// ─── Resolve trigger ID ───────────────────────────────────────────────────────

async function resolveTriggerIdOrExit(input: string): Promise<string> {
  if (input.length === 36 && input.includes("-")) return input;

  const { data: pending } = await apiGet<PendingTrigger[]>("/api/triggers/pending");
  const matches = pending.filter((t) => t.id.startsWith(input));

  if (matches.length === 0) {
    errorMsg(`No pending trigger found matching '${input}'`);
    process.exit(1);
  }
  if (matches.length > 1) {
    errorMsg(`Multiple triggers match '${input}'. Use a longer ID prefix.`);
    process.exit(1);
  }

  return matches[0].id;
}
