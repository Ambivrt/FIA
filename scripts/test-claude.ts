/**
 * Snabbtest: Verifiera att Claude API-anslutningen fungerar.
 * Kör: npx ts-node scripts/test-claude.ts
 */
import { loadConfig } from "../src/utils/config";
import { callClaude } from "../src/llm/claude";

async function main() {
  const config = loadConfig();

  if (!config.anthropicApiKey) {
    console.error("❌ ANTHROPIC_API_KEY saknas i .env");
    process.exit(1);
  }

  console.log("🔑 API-nyckel hittad, testar Claude Opus 4.6...\n");

  const response = await callClaude(config, "claude-opus-4-6", {
    systemPrompt: "Du är FIA, Forefronts AI-gateway. Svara kortfattat på svenska.",
    userPrompt: "Bekräfta att du är online. Svara med en mening.",
    maxTokens: 100,
    temperature: 0.3,
  });

  console.log("✅ Svar:", response.text);
  console.log(`\n📊 Modell: ${response.model}`);
  console.log(`   Tokens in: ${response.tokensIn}`);
  console.log(`   Tokens ut: ${response.tokensOut}`);
  console.log(`   Tid: ${response.durationMs}ms`);
  console.log(`   Uppskattad kostnad: $${((response.tokensIn * 15 + response.tokensOut * 75) / 1_000_000).toFixed(4)}`);
}

main().catch((err) => {
  console.error("❌ Fel:", err.message);
  process.exit(1);
});
