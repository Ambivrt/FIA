import { SupabaseClient } from "@supabase/supabase-js";
import { Logger } from "../gateway/logger";
import { logActivity } from "../supabase/activity-writer";

interface KillSwitchState {
  active: boolean;
  activatedAt: string | null;
  activatedBy: string | null;
  source: string | null;
}

export class KillSwitch {
  private state: KillSwitchState = {
    active: false,
    activatedAt: null,
    activatedBy: null,
    source: null,
  };

  constructor(
    private readonly supabase: SupabaseClient | null,
    private readonly logger: Logger
  ) {}

  async activate(source: "slack" | "api" | "realtime", userId?: string): Promise<void> {
    this.state = {
      active: true,
      activatedAt: new Date().toISOString(),
      activatedBy: userId ?? null,
      source,
    };

    this.logger.warn("Kill switch activated", {
      action: "kill_switch_activate",
      status: "success",
      details: { source, userId },
    });

    if (this.supabase) {
      const { error } = await this.supabase
        .from("agents")
        .update({ status: "paused" })
        .in("slug", ["content", "campaign", "seo", "lead"]);

      if (error) {
        this.logger.error("Failed to pause agents in Supabase", {
          action: "kill_switch_activate",
          error: error.message,
        });
      }

      await logActivity(this.supabase, {
        user_id: userId,
        action: "kill_switch_activated",
        details_json: { source },
      });
    }
  }

  async deactivate(source: "slack" | "api" | "realtime", userId?: string): Promise<void> {
    this.state = {
      active: false,
      activatedAt: null,
      activatedBy: null,
      source: null,
    };

    this.logger.info("Kill switch deactivated", {
      action: "kill_switch_deactivate",
      status: "success",
      details: { source, userId },
    });

    if (this.supabase) {
      const { error } = await this.supabase
        .from("agents")
        .update({ status: "active" })
        .eq("status", "paused");

      if (error) {
        this.logger.error("Failed to resume agents in Supabase", {
          action: "kill_switch_deactivate",
          error: error.message,
        });
      }

      await logActivity(this.supabase, {
        user_id: userId,
        action: "kill_switch_deactivated",
        details_json: { source },
      });
    }
  }

  isActive(): boolean {
    return this.state.active;
  }

  getStatus(): { active: boolean; activated_at: string | null; activated_by: string | null } {
    return {
      active: this.state.active,
      activated_at: this.state.activatedAt,
      activated_by: this.state.activatedBy,
    };
  }
}
