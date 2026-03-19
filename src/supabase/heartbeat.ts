import { SupabaseClient } from "@supabase/supabase-js";
import { Logger } from "../gateway/logger";

export function startHeartbeat(supabase: SupabaseClient, logger: Logger, intervalMs: number = 60_000): NodeJS.Timeout {
  async function beat(): Promise<void> {
    const { error } = await supabase
      .from("agents")
      .update({ last_heartbeat: new Date().toISOString() })
      .in("status", ["active", "idle"]);

    if (error) {
      logger.error("Heartbeat write failed", { action: "heartbeat", error: error.message });
    } else {
      logger.debug("Heartbeat sent", { action: "heartbeat" });
    }
  }

  // Send first heartbeat immediately
  beat();
  return setInterval(beat, intervalMs);
}
