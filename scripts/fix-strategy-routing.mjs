#!/usr/bin/env node
/**
 * Engångsskript: Ta bort "routing" från Strategy Agents _admin_overrides i Supabase.
 * Detta återställer routing till agent.yaml-defaults (strategic_research: google-search).
 *
 * Kör: node scripts/fix-strategy-routing.mjs
 */

import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");

// Minimal .env parser
function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SLUG = "strategy";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY krävs i .env");
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// 1. Hämta agent
const getRes = await fetch(`${SUPABASE_URL}/rest/v1/agents?slug=eq.${SLUG}&select=id,config_json`, { headers });

if (!getRes.ok) {
  console.error("Fetch misslyckades:", getRes.status, await getRes.text());
  process.exit(1);
}

const agents = await getRes.json();
if (agents.length === 0) {
  console.error(`Agent "${SLUG}" hittades inte i Supabase.`);
  process.exit(1);
}

const agent = agents[0];
const cfg = agent.config_json ?? {};
const overrides = cfg._admin_overrides ?? [];

console.log("Agent ID:", agent.id);
console.log("Nuvarande _admin_overrides:", JSON.stringify(overrides));

if (!overrides.includes("routing")) {
  console.log(`\n✓ "routing" finns inte i _admin_overrides — inget att göra.`);
  if (cfg.routing) {
    console.log("Nuvarande routing i config_json:", JSON.stringify(cfg.routing, null, 2));
  }
  process.exit(0);
}

console.log("Nuvarande dashboard-routing:", JSON.stringify(cfg.routing, null, 2));

// 2. Ta bort "routing" från _admin_overrides
const newOverrides = overrides.filter((o) => o !== "routing");
const updated = { ...cfg };

if (newOverrides.length > 0) {
  updated._admin_overrides = newOverrides;
} else {
  delete updated._admin_overrides;
}

// 3. Uppdatera
const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/agents?id=eq.${agent.id}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ config_json: updated }),
});

if (!patchRes.ok) {
  console.error("Uppdatering misslyckades:", patchRes.status, await patchRes.text());
  process.exit(1);
}

console.log(`\n✓ Tog bort "routing" från _admin_overrides för "${SLUG}".`);
console.log("  Nya _admin_overrides:", JSON.stringify(newOverrides.length > 0 ? newOverrides : []));
console.log("  Vid nästa gateway-restart synkas routing från agent.yaml (strategic_research → google-search).");
