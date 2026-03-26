// Supabase Realtime-prenumeration för tail/watch-kommandon

import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { CLI_CONFIG, validateRealtimeConfig } from "./config";
import type { ActivityLogEntry } from "../types";

let supabaseInstance: SupabaseClient | null = null;
let channels: RealtimeChannel[] = [];

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    validateRealtimeConfig();
    supabaseInstance = createClient(CLI_CONFIG.supabaseUrl, CLI_CONFIG.supabaseServiceRoleKey);
  }
  return supabaseInstance;
}

export function subscribeToActivityLog(
  callback: (entry: ActivityLogEntry) => void,
  filter?: { agent_slug?: string },
): RealtimeChannel {
  const supabase = getSupabase();

  const channel = supabase
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

  channels.push(channel);
  return channel;
}

export interface TaskChange {
  id: string;
  status: string;
  sub_status: string | null;
  agent_id: string;
  type: string;
}

/** Subscribe to task status/sub_status changes for the watch dashboard. */
export function subscribeToTaskChanges(callback: (task: TaskChange) => void): RealtimeChannel {
  const supabase = getSupabase();

  const channel = supabase
    .channel("cli-task-changes")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "tasks",
      },
      (payload) => {
        const row = payload.new as TaskChange;
        callback(row);
      },
    )
    .subscribe();

  channels.push(channel);
  return channel;
}

export function unsubscribe(): void {
  for (const ch of channels) {
    ch.unsubscribe();
  }
  channels = [];
}
