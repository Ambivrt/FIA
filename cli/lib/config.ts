// CLI-konfiguration – läser .env och exporterar relevanta värden

import dotenv from "dotenv";
import path from "path";

// Ladda .env – försök flera sökvägar:
// 1. Relativt __dirname (dist/cli/lib/ → dist/.env)
// 2. Relativt __dirname (dist/cli/lib/ → projektrot/.env)
// 3. CWD (för npm link / global install)
// 4. ~/.fia/.env (användarens hemkatalog)
const envPaths = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.env.HOME || "~", ".fia", ".env"),
];

for (const envPath of envPaths) {
  if (!process.env.FIA_CLI_TOKEN || !process.env.SUPABASE_URL) {
    dotenv.config({ path: envPath });
  }
}

export const CLI_CONFIG = {
  apiBaseUrl: `http://localhost:${process.env.GATEWAY_API_PORT || "3001"}`,
  cliToken: process.env.FIA_CLI_TOKEN || "",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
} as const;

export function validateConfig(): void {
  if (!CLI_CONFIG.cliToken) {
    process.stderr.write("Error: FIA_CLI_TOKEN is not set in .env\n");
    process.exit(1);
  }
}

export function validateRealtimeConfig(): void {
  if (!CLI_CONFIG.supabaseUrl || !CLI_CONFIG.supabaseServiceRoleKey) {
    process.stderr.write("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for realtime features\n");
    process.exit(1);
  }
}
