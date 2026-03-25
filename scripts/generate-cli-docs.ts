import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";

const commands = [
  "status",
  "agents",
  "run",
  "queue",
  "approve",
  "reject",
  "kill",
  "resume",
  "logs",
  "tail",
  "watch",
  "config",
  "triggers",
  "lineage",
  "cron",
];

const outDir = "docs/docs/interfaces/cli";
mkdirSync(outDir, { recursive: true });

let md = "# CLI-kommandon (referens)\n\n";
md += '!!! info "Auto-genererad"\n';
md += "    Denna sida genereras från `fia --help`. Senast uppdaterad: " + new Date().toISOString().split("T")[0] + "\n\n";

// Main help
try {
  const mainHelp = execSync("npx ts-node -P tsconfig.cli.json cli/index.ts --help 2>/dev/null", {
    encoding: "utf-8",
    timeout: 15000,
    env: { ...process.env, FIA_CLI_TOKEN: "docs-generation" },
  });
  md += `## fia\n\n\`\`\`\n${mainHelp.trim()}\n\`\`\`\n\n---\n\n`;
} catch {
  md += "## fia\n\nKunde inte generera help-text.\n\n---\n\n";
}

for (const cmd of commands) {
  try {
    const help = execSync(`npx ts-node -P tsconfig.cli.json cli/index.ts ${cmd} --help 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 15000,
      env: { ...process.env, FIA_CLI_TOKEN: "docs-generation" },
    });
    md += `## fia ${cmd}\n\n\`\`\`\n${help.trim()}\n\`\`\`\n\n`;
  } catch {
    md += `## fia ${cmd}\n\nKunde inte generera help-text för \`${cmd}\`.\n\n`;
  }
}

const outPath = `${outDir}/commands-reference.md`;
writeFileSync(outPath, md);
console.log(`✓ CLI-referens skriven till ${outPath} (${commands.length} kommandon)`);
