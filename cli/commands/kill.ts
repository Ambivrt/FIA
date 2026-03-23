// fia kill [--force] – Aktivera kill switch

import { Command } from "commander";
import * as readline from "readline";
import chalk from "chalk";
import { apiPost } from "../lib/api-client";
import { successMsg } from "../lib/formatters";
import type { KillSwitchStatus } from "../types";

export function registerKillCommand(program: Command): void {
  program
    .command("kill")
    .description("Activate the kill switch (pauses ALL agents)")
    .option("--force", "Skip confirmation prompt")
    .action(async (opts: { force?: boolean }) => {
      if (!opts.force) {
        const confirmed = await confirm(
          chalk.yellow("\u26A0 This will pause ALL agents immediately. Continue? (y/N) "),
        );
        if (!confirmed) {
          process.stdout.write("Aborted.\n");
          return;
        }
      }

      await apiPost<KillSwitchStatus>("/api/kill-switch", { action: "activate" });
      successMsg("Kill switch activated.");
    });
}

function confirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
