// fia drive [status|setup] – Hantera Google Drive-mappstruktur för agenter

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import Table from "cli-table3";
import { apiGet, apiPost } from "../lib/api-client";
import { successMsg, errorMsg } from "../lib/formatters";
import { EARTH, GRADIENT } from "../lib/formatters";

interface FolderMapEntry {
  path: string;
  folderId: string;
  name: string;
}

interface DriveSetupResponse {
  dry_run: boolean;
  created: FolderMapEntry[];
  existing: FolderMapEntry[];
  errors: Array<{ path: string; error: string }>;
  folderMap: Record<string, string>;
}

interface DriveStatusResponse {
  configured: boolean;
  folder_count: number;
  expected_count: number;
  folder_map: Record<string, string>;
}

export function registerDriveCommand(program: Command): void {
  const drive = program.command("drive").description("Manage Google Drive folder structure for agents");

  // fia drive status
  drive
    .command("status")
    .description("Show current Drive folder map")
    .action(async () => {
      const { data } = await apiGet<DriveStatusResponse>("/api/drive/status");

      if (!data.configured) {
        process.stdout.write(
          chalk.yellow("Ingen mappstruktur konfigurerad. Kör: ") + chalk.bold("fia drive setup") + "\n",
        );
        return;
      }

      process.stdout.write(GRADIENT.orange.bold("Drive-mappar") + EARTH.stone(` (${data.folder_count}/${data.expected_count})`) + "\n\n");

      const table = new Table({
        head: [chalk.bold("Mapp"), chalk.bold("Folder ID")],
        style: { head: [], border: [] },
      });

      const paths = Object.keys(data.folder_map).sort();
      for (const p of paths) {
        const depth = p.split("/").length - 1;
        const indent = "  ".repeat(depth);
        const name = p.split("/").pop() ?? p;
        table.push([EARTH.forest(`${indent}${name}`), EARTH.stone(data.folder_map[p])]);
      }

      process.stdout.write(table.toString() + "\n");
    });

  // fia drive setup [--dry-run]
  drive
    .command("setup")
    .description("Create Drive folder structure for FIA agents")
    .option("--dry-run", "Preview what would be created without making changes")
    .action(async (opts: { dryRun?: boolean }) => {
      const dryRun = opts.dryRun === true;

      if (dryRun) {
        process.stdout.write(EARTH.slate("Dry run — inga ändringar görs\n\n"));
      }

      const spinner = ora("Skapar mappstruktur på Google Drive...").start();

      try {
        const { data } = await apiPost<DriveSetupResponse>("/api/drive/setup", {
          dry_run: dryRun,
        });

        spinner.stop();

        // Show created folders
        if (data.created.length > 0) {
          process.stdout.write(GRADIENT.orange.bold("Skapade mappar:") + "\n");
          for (const f of data.created) {
            process.stdout.write(
              chalk.green("  + ") + f.path + (dryRun ? "" : EARTH.stone(` (${f.folderId})`)) + "\n",
            );
          }
          process.stdout.write("\n");
        }

        // Show existing folders
        if (data.existing.length > 0) {
          process.stdout.write(EARTH.slate("Redan befintliga:") + "\n");
          for (const f of data.existing) {
            process.stdout.write(EARTH.stone(`  ✓ ${f.path} (${f.folderId})`) + "\n");
          }
          process.stdout.write("\n");
        }

        // Show errors
        if (data.errors.length > 0) {
          process.stdout.write(chalk.red.bold("Fel:") + "\n");
          for (const e of data.errors) {
            process.stdout.write(chalk.red(`  ✗ ${e.path}: ${e.error}`) + "\n");
          }
          process.stdout.write("\n");
        }

        // Summary
        const summary = [
          `${data.created.length} skapade`,
          `${data.existing.length} befintliga`,
          data.errors.length > 0 ? `${data.errors.length} fel` : null,
        ]
          .filter(Boolean)
          .join(", ");

        if (data.errors.length > 0) {
          errorMsg(`Drive setup klar med fel: ${summary}`);
        } else {
          successMsg(`Drive setup klar: ${summary}${dryRun ? " (dry run)" : ""}`);
        }
      } catch (err) {
        spinner.fail("Drive setup misslyckades");
        errorMsg((err as Error).message);
        process.exit(1);
      }
    });
}
