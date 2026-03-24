// Supabase-klient för CLI-kommandon som behöver direkt databasåtkomst

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CLI_CONFIG, validateRealtimeConfig } from "./config";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  validateRealtimeConfig();
  if (!client) {
    client = createClient(CLI_CONFIG.supabaseUrl, CLI_CONFIG.supabaseServiceRoleKey);
  }
  return client;
}
