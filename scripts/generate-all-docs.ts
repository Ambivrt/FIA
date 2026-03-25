import { execSync } from "child_process";

const scripts = [
  { name: "OpenAPI spec", cmd: "npx ts-node scripts/generate-openapi.ts" },
  { name: "Agent referens", cmd: "npx ts-node scripts/generate-agent-docs.ts" },
  { name: "CLI referens", cmd: "npx ts-node scripts/generate-cli-docs.ts" },
];

console.log("═══ FIA Docs: Genererar auto-docs ═══\n");

let failed = 0;

for (const script of scripts) {
  try {
    console.log(`→ ${script.name}...`);
    execSync(script.cmd, { stdio: "inherit", timeout: 60000 });
  } catch (err) {
    console.error(`✗ ${script.name} misslyckades: ${(err as Error).message}`);
    failed++;
  }
}

console.log(`\n═══ Klart: ${scripts.length - failed}/${scripts.length} lyckades ═══`);

if (failed > 0) {
  process.exit(1);
}
