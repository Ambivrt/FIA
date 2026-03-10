import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";

export function createSupabaseClient(config: AppConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
