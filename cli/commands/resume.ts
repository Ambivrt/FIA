// fia resume – Avaktivera kill switch

import { Command } from "commander";
import { apiPost } from "../lib/api-client";
import { successMsg } from "../lib/formatters";
import type { KillSwitchStatus } from "../types";

export function registerResumeCommand(program: Command): void {
  program
    .command("resume")
    .description("Deactivate the kill switch (resume all agents)")
    .action(async () => {
      await apiPost<KillSwitchStatus>("/api/kill-switch", { action: "deactivate" });
      successMsg("Kill switch deactivated. Agents resuming.");
    });
}
