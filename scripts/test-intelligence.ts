/**
 * Quick smoke-test for Intelligence Agent.
 *
 * Usage:
 *   npx ts-node scripts/test-intelligence.ts
 *
 * Requires: ANTHROPIC_API_KEY, SERPER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 */
import { loadConfig } from "../src/utils/config";
import { createLogger } from "../src/gateway/logger";
import { createSupabaseClient } from "../src/supabase/client";
import { createAgent } from "../src/agents/agent-factory";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const supabase = createSupabaseClient(config);

  console.log("Creating Intelligence Agent...");
  const agent = createAgent("intelligence", config, logger, supabase);

  console.log("Running morning_scan...");
  const result = await agent.execute({
    type: "morning_scan",
    title: "Test: Intelligence morgonscan",
    input: "Manuellt test av Intelligence Agent",
    priority: "normal",
    onProgress: async (_action, message) => {
      console.log(`  [progress] ${message}`);
    },
  });

  console.log("\n=== RESULTAT ===");
  console.log(`Status: ${result.status}`);
  console.log(`Task ID: ${result.taskId}`);
  console.log(`Model: ${result.model}`);
  console.log(`Tokens: ${result.tokensIn} in / ${result.tokensOut} out`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`\nOutput (first 500 chars):\n${result.output.slice(0, 500)}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
