/**
 * Google Auth — gemensam autentisering for Google API:er (GWS + GA4).
 *
 * Hanterar OAuth2 (via @alanse MCP-paket) och service account (via GA4 credentials).
 * Sakerställer att `google.options({ auth })` ar satt globalt innan verktyg anropas.
 */

import { AppConfig } from "../utils/config";

let _oauthInitialized = false;
let _serviceAccountClient: unknown | null = null;

const AUTH_TIMEOUT_MS = 10_000;

/**
 * Ensure the googleapis global auth is set via OAuth2 (workspace user).
 * Used by GWS tools (Drive, Docs, Sheets, Gmail, Calendar).
 * Includes a 10s timeout to prevent hangs during auth initialization.
 */
export async function ensureOAuthGlobalAuth(): Promise<void> {
  if (_oauthInitialized) return;
  try {
    await Promise.race([
      (async () => {
        const { google } = await import("googleapis");
        // @ts-expect-error — no type declarations for MCP package internals
        const authMod = await import("@alanse/mcp-server-google-workspace/dist/auth.js");
        const authClient = await authMod.loadCredentialsQuietly();
        if (authClient) {
          google.options({ auth: authClient });
          authMod.setupTokenRefresh();
          _oauthInitialized = true;
        }
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("GWS auth initialization timed out")), AUTH_TIMEOUT_MS),
      ),
    ]);
  } catch {
    // Auth not available or timed out — tools will fail with descriptive errors
  }
}

/**
 * Get a Google Auth client for service-account-based APIs (e.g. GA4).
 * Uses the credentials file at config.ga4CredentialsPath.
 */
export async function getServiceAccountAuth(config: AppConfig, scopes: string[]): Promise<unknown | null> {
  if (_serviceAccountClient) return _serviceAccountClient;

  if (!config.ga4CredentialsPath) return null;

  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      keyFile: config.ga4CredentialsPath,
      scopes,
    });
    _serviceAccountClient = await auth.getClient();
    return _serviceAccountClient;
  } catch {
    return null;
  }
}

/**
 * Check if OAuth auth is configured and working.
 */
export function isOAuthInitialized(): boolean {
  return _oauthInitialized;
}

/** Reset auth state (for testing). */
export function _resetAuth(): void {
  _oauthInitialized = false;
  _serviceAccountClient = null;
}
