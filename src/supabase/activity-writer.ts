import { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityInput {
  agent_id?: string;
  user_id?: string;
  action: string;
  details_json?: Record<string, unknown>;
}

export async function logActivity(
  supabase: SupabaseClient,
  entry: ActivityInput
): Promise<void> {
  const { error } = await supabase.from("activity_log").insert(entry);
  if (error) throw new Error(`Failed to log activity: ${error.message}`);
}
