// Formatering av tabeller, färger och layout för CLI-output

import chalk from "chalk";
import Table from "cli-table3";
import boxen from "boxen";
import type { DisplayStatus, DisplayStatusResult } from "../types";

// Forefront Earth-palett (varumärkesfärger)
export const EARTH = {
  plum: chalk.hex("#7D5365"),
  forest: chalk.hex("#42504E"),
  slate: chalk.hex("#555977"),
  walnut: chalk.hex("#756256"),
  stone: chalk.hex("#7E7C83"),
} as const;

// Forefront gradient-färger (accent)
export const GRADIENT = {
  orange: chalk.hex("#FF6B0B"),
  pink: chalk.hex("#FFB7F8"),
  cyan: chalk.hex("#79F2FB"),
} as const;

// Stabil Earth-färg per agent (round-robin genom paletten)
const EARTH_AGENTS: chalk.Chalk[] = [EARTH.plum, EARTH.forest, EARTH.slate, EARTH.walnut, EARTH.stone];

// Chalk-mappning per display status
const CHALK_MAP: Record<DisplayStatus, chalk.Chalk> = {
  online: chalk.green,
  working: chalk.yellow,
  paused: chalk.gray,
  killed: chalk.bgWhite.black,
  error: chalk.red,
};

export function statusBadge(result: DisplayStatusResult, width?: number): string {
  const colorFn = CHALK_MAP[result.status];
  const text = `${result.symbol} ${result.label.toLowerCase()}`;
  return colorFn(width ? text.padEnd(width) : text);
}

export function statusSymbol(result: DisplayStatusResult): string {
  const colorFn = CHALK_MAP[result.status];
  return colorFn(result.symbol);
}

export function colorByAgent(slug: string, text: string): string {
  // Stabil Forefront Earth-färg per agent baserat på slug
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  const colorFn = EARTH_AGENTS[Math.abs(hash) % EARTH_AGENTS.length];
  return colorFn(text);
}

// Ikon per agent-slug
const AGENT_ICONS: Record<string, string> = {
  strategy: "♟",
  content: "✏",
  campaign: "📣",
  seo: "🔍",
  lead: "🎯",
  analytics: "📊",
  brand: "🛡",
  intelligence: "📡",
};

export function agentLabel(slug: string, name: string, width?: number): string {
  const padded = width ? name.padEnd(width) : name;
  return colorByAgent(slug, padded);
}

export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function shortId(uuid: string): string {
  return uuid.slice(0, 6);
}

export function formatCost(costSek: number | null): string {
  if (costSek === null || costSek === undefined) return "—";
  return `${costSek.toFixed(1)} kr`;
}

export function formatTokens(tokens: number | null): string {
  if (tokens === null || tokens === undefined) return "—";
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
}

export function createTable(head: string[], colWidths?: number[]): Table.Table {
  const opts: Table.TableConstructorOptions = {
    head: head.map((h) => EARTH.slate(chalk.bold(h))),
    style: { head: [], border: [] },
  };
  if (colWidths) opts.colWidths = colWidths;
  return new Table(opts);
}

export function box(content: string, title?: string): string {
  return boxen(content, {
    padding: 1,
    borderStyle: "round",
    borderColor: "#7D5365",
    title: title ? chalk.bold(title) : undefined,
    titleAlignment: "left",
  });
}

/**
 * FIA welcome banner med Forefront gradient-färger.
 * Visas vid `fia` utan kommando.
 */
export function banner(): string {
  const lines = [
    "  ███████╗ ██╗  █████╗ ",
    "  ██╔════╝ ██║ ██╔══██╗",
    "  █████╗   ██║ ███████║",
    "  ██╔══╝   ██║ ██╔══██║",
    "  ██║      ██║ ██║  ██║",
    "  ╚═╝      ╚═╝ ╚═╝  ╚═╝",
  ];

  // Gradient: orange → pink → cyan radvis
  const gradientFns = [GRADIENT.orange, GRADIENT.orange, GRADIENT.pink, GRADIENT.pink, GRADIENT.cyan, GRADIENT.cyan];

  const colored = lines.map((line, i) => gradientFns[i](line));

  const subtitle = EARTH.stone("  Forefront Intelligent Automation");
  const tagline = EARTH.plum("  Delade visioner. Större ambitioner.");
  const version = chalk.dim("  v0.5.3");

  return [
    "",
    ...colored,
    "",
    subtitle,
    tagline,
    version,
    "",
    chalk.dim("  Run fia --help for available commands."),
    "",
  ].join("\n");
}

export function errorMsg(message: string): void {
  process.stderr.write(chalk.red(`\u2717 ${message}\n`));
}

export function successMsg(message: string): void {
  process.stdout.write(chalk.green(`\u2713 ${message}\n`));
}

export function warnMsg(message: string): void {
  process.stdout.write(chalk.yellow(`\u26A0 ${message}\n`));
}

export function progressBar(ratio: number, width: number = 5): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return "\u2593".repeat(filled) + "\u2591".repeat(empty);
}
