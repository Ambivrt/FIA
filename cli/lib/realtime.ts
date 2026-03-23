// Supabase Realtime-prenumeration för tail/watch-kommandon

import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { CLI_CONFIG, validateRealtimeConfig } from "./config";
import type { ActivityLogEntry } from "../types";

let channel: RealtimeChannel | null = null;

export function subscribeToActivityLog(
  callback: (entry: ActivityLogEntry) => void,
  filter?: { agent_slug?: string },
): RealtimeChannel {
  validateRealtimeConfig();

  const supabase = createClient(CLI_CONFIG.supabaseUrl, CLI_CONFIG.supabaseServiceRoleKey);

  channel = supabase
    .channel("cli-activity-log")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activity_log",
      },
      async (payload) => {
        const entry = payload.new as ActivityLogEntry;

        // Om filter på agent_slug, hämta agent-info
        if (filter?.agent_slug && entry.agent_id) {
          const { data: agent } = await supabase.from("agents").select("slug, name").eq("id", entry.agent_id).single();

          if (!agent || agent.slug !== filter.agent_slug) return;
          entry.agents = agent;
        } else if (entry.agent_id) {
          const { data: agent } = await supabase.from("agents").select("slug, name").eq("id", entry.agent_id).single();

          if (agent) entry.agents = agent;
        }

        callback(entry);
      },
    )
    .subscribe();

  return channel;
}

export function unsubscribe(): void {
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
}
