// fia integrations – Visa status for alla MCP-integrationer

import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { apiGet } from "../lib/api-client";
import { EARTH, GRADIENT } from "../lib/formatters";

interface IntegrationHealth {
  service: string;
  label: string;
  status: "connected" | "disconnected" | "error" | "not_configured";
  message?: string;
}

interface IntegrationsResponse {
  integrations: IntegrationHealth[];
}

function statusBadge(status: IntegrationHealth["status"]): string {
  switch (status) {
    case "connected":
      return chalk.green("● Ansluten");
    case "disconnected":
      return chalk.yellow("○ Frakopplad");
    case "error":
      return chalk.red("✗ Fel");
    case "not_configured":
      return chalk.dim("— Ej konfigurerad");
  }
}

export function registerIntegrationsCommand(program: Command): void {
  program
    .command("integrations")
    .description("Show status for all MCP integrations")
    .action(async () => {
      const { data } = await apiGet<IntegrationsResponse>("/api/integrations/status");

      process.stdout.write(GRADIENT.orange.bold("Integrationer") + "\n\n");

      const table = new Table({
        head: [chalk.bold("Tjanst"), chalk.bold("Status"), chalk.bold("Detaljer")],
        style: { head: [], border: [] },
        colWidths: [22, 20, 40],
      });

      for (const integration of data.integrations) {
        table.push([
          EARTH.forest(integration.label),
          statusBadge(integration.status),
          integration.message ? EARTH.stone(integration.message) : "",
        ]);
      }

      process.stdout.write(table.toString() + "\n");

      // Summary
      const connected = data.integrations.filter((i) => i.status === "connected").length;
      const total = data.integrations.length;
      process.stdout.write("\n" + EARTH.stone(`${connected}/${total} integrationer anslutna`) + "\n");
    });
}
