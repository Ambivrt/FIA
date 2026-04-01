/**
 * Integration Status — health checks for alla MCP-integrationer.
 *
 * Returnerar status per integration (connected / disconnected / error / not_configured).
 * Cachear resultat i 60 sekunder for att undvika overbelastning.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { isOAuthInitialized } from "./google-auth";
import { checkGa4Health } from "./ga4";
import { checkWorkvivoHealth } from "./workvivo";

export type IntegrationStatusCode = "connected" | "disconnected" | "error" | "not_configured";

export interface IntegrationHealth {
  service: string;
  label: string;
  status: IntegrationStatusCode;
  message?: string;
}

let _cachedResult: IntegrationHealth[] | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Check health of all configured integrations.
 * Results are cached for 60 seconds.
 */
export async function checkIntegrationHealth(config: AppConfig): Promise<IntegrationHealth[]> {
  const now = Date.now();
  if (_cachedResult && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedResult;
  }

  const results: IntegrationHealth[] = [];

  // GWS (Google Workspace) — check if OAuth is initialized
  results.push({
    service: "gws",
    label: "Google Workspace",
    status: isOAuthInitialized() ? "connected" : "disconnected",
    message: isOAuthInitialized() ? undefined : "OAuth ej initialiserad",
  });

  // GA4 (Google Analytics 4)
  const ga4 = await checkGa4Health(config);
  results.push({
    service: "ga4",
    label: "Google Analytics 4",
    status: !config.ga4CredentialsPath ? "not_configured" : ga4.ok ? "connected" : "error",
    message: ga4.error,
  });

  // Workvivo
  const workvivo = await checkWorkvivoHealth(config);
  results.push({
    service: "workvivo",
    label: "Workvivo",
    status: !config.workvivoApiKey ? "not_configured" : workvivo.ok ? "connected" : "error",
    message: workvivo.error,
  });

  // HubSpot (Phase 2 — show config status only)
  results.push({
    service: "hubspot",
    label: "HubSpot",
    status: config.hubspotApiKey ? "disconnected" : "not_configured",
    message: config.hubspotApiKey ? "Wrapper ej implementerad (Fas 2)" : undefined,
  });

  // LinkedIn (Phase 2 — show config status only)
  results.push({
    service: "linkedin",
    label: "LinkedIn",
    status: config.linkedinAccessToken ? "disconnected" : "not_configured",
    message: config.linkedinAccessToken ? "Wrapper ej implementerad (Fas 2)" : undefined,
  });

  // Buffer (Phase 2 — show config status only)
  results.push({
    service: "buffer",
    label: "Buffer",
    status: config.bufferAccessToken ? "disconnected" : "not_configured",
    message: config.bufferAccessToken ? "Wrapper ej implementerad (Fas 2)" : undefined,
  });

  _cachedResult = results;
  _cacheTimestamp = now;

  return results;
}

/**
 * Persist integration health to Supabase system_settings
 * so the Dashboard can read it without calling the gateway API.
 */
export async function persistIntegrationHealth(config: AppConfig, supabase: SupabaseClient): Promise<void> {
  try {
    const health = await checkIntegrationHealth(config);
    await supabase.from("system_settings").upsert(
      {
        key: "integration_status",
        value: { integrations: health, updated_at: new Date().toISOString() },
      },
      { onConflict: "key" },
    );
  } catch {
    // Silently fail — dashboard will show stale data
  }
}

/** Force-clear the cache (e.g. after config reload). */
export function clearIntegrationCache(): void {
  _cachedResult = null;
  _cacheTimestamp = 0;
}
