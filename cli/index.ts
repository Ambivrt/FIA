#!/usr/bin/env node

// FIA CLI – Terminalverktyg för FIA Gateway
// Pratar med REST API:t på port 3001

import { Command } from "commander";
import { validateConfig } from "./lib/config";
import { banner } from "./lib/formatters";
import { registerStatusCommand } from "./commands/status";
import { registerAgentsCommand } from "./commands/agents";
import { registerRunCommand } from "./commands/run";
import { registerQueueCommand } from "./commands/queue";
import { registerApproveCommand } from "./commands/approve";
import { registerRejectCommand } from "./commands/reject";
import { registerKillCommand } from "./commands/kill";
import { registerResumeCommand } from "./commands/resume";
import { registerLogsCommand } from "./commands/logs";
import { registerTailCommand } from "./commands/tail";
import { registerWatchCommand } from "./commands/watch";
import { registerConfigCommand } from "./commands/config";
import { registerTriggersCommand } from "./commands/triggers";
import { registerLineageCommand } from "./commands/lineage";
import { registerCronCommand } from "./commands/cron";
import { registerDriveCommand } from "./commands/drive";
import { registerCostsCommand } from "./commands/costs";
import { registerKnowledgeCommand } from "./commands/knowledge";

const program = new Command();

program
  .name("fia")
  .description("FIA CLI – Terminal interface for Forefront Intelligent Automation")
  .version("0.6.0")
  .action(() => {
    // Visa banner när fia körs utan kommando
    process.stdout.write(banner());
  })
  .hook("preSubcommand", () => {
    validateConfig();
  });

registerStatusCommand(program);
registerAgentsCommand(program);
registerRunCommand(program);
registerQueueCommand(program);
registerApproveCommand(program);
registerRejectCommand(program);
registerKillCommand(program);
registerResumeCommand(program);
registerLogsCommand(program);
registerTailCommand(program);
registerWatchCommand(program);
registerConfigCommand(program);
registerTriggersCommand(program);
registerLineageCommand(program);
registerCronCommand(program);
registerDriveCommand(program);
registerCostsCommand(program);
registerKnowledgeCommand(program);

// Globalt felhantering
program.exitOverride();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err: unknown) {
    if (err instanceof Error && err.message !== "(outputHelp)") {
      const name = (err as { code?: string }).code;
      if (name === "commander.helpDisplayed" || name === "commander.version") {
        process.exit(0);
      }
      // Nätverksfel
      if (err.message.includes("ECONNREFUSED")) {
        process.stderr.write("Error: Cannot connect to FIA Gateway. Is it running?\n");
        process.exit(1);
      }
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    }
  }
}

main();
