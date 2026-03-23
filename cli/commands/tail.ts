// fia tail [--agent content] – Live-stream av activity_log

import { Command } from "commander";
import chalk from "chalk";
import { subscribeToActivityLog, unsubscribe } from "../lib/realtime";
import { colorByAgent } from "../lib/formatters";
import type { ActivityLogEntry } from "../types";

export function registerTailCommand(program: Command): void {
  program
    .command("tail")
    .description("Live-stream activity log (Ctrl+C to stop)")
    .option("--agent <slug>", "Filter by agent slug")
    .action(async (opts: { agent?: string }) => {
      process.stdout.write(chalk.dim("Listening for activity... (Ctrl+C to stop)\n\n"));

      subscribeToActivityLog(
        (entry: ActivityLogEntry) => {
          const time = new Date(entry.created_at).toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          const agent = entry.agents?.slug ?? "system";
          const details = entry.details_json ?? {};
          const extra = details.type ? String(details.type) : "";
          const title = details.title ? ` "${String(details.title).slice(0, 40)}"` : "";

          process.stdout.write(
            `${chalk.dim(`[${time}]`)} ${colorByAgent(agent, agent.padEnd(14))} ${entry.action.padEnd(20)} ${extra}${title}\n`,
          );
        },
        opts.agent ? { agent_slug: opts.agent } : undefined,
      );

      // Vänta tills användaren trycker Ctrl+C
      const cleanup = (): void => {
        unsubscribe();
        process.stdout.write(chalk.dim("\nDisconnected.\n"));
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Håll event-loopen igång tills signal
      await new Promise<void>(() => {});
    });
}
