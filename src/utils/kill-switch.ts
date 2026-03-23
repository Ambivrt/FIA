import { SupabaseClient } from "@supabase/supabase-js";
import { Logger } from "../gateway/logger";
import { logActivity } from "../supabase/activity-writer";
import type { TaskQueue } from "../gateway/task-queue";

interface KillSwitchState {
  active: boolean;
  activatedAt: string | null;
  activatedBy: string | null;
  source: "slack" | "api" | "realtime" | "restore" | null;
}

export class KillSwitch {
  private state: KillSwitchState = {
    active: false,
    activatedAt: null,
    activatedBy: null,
    source: null,
  };

  private taskQueue: TaskQueue | null = null;

  constructor(
    private readonly supabase: SupabaseClient | null,
    private readonly logger: Logger,
  ) {}

  setTaskQueue(queue: TaskQueue): void {
    this.taskQueue = queue;
  }

  async activate(source: "slack" | "api" | "realtime", userId?: string): Promise<void> {
    // Write to database FIRST so dashboard (which reads system_settings) stays consistent
    if (this.supabase) {
      const { error: settingsError } = await this.supabase
        .from("system_settings")
        .update({
          value: { active: true },
          updated_at: new Date().toISOString(),
          updated_by: userId ?? null,
        })
        .eq("key", "kill_switch");

      if (settingsError) {
        this.logger.error("Failed to update system_settings for kill switch – aborting activation", {
          action: "kill_switch_activate",
          error: settingsError.message,
        });
        throw new Error(`Kill switch DB update failed: ${settingsError.message}`);
      }

      const { error } = await this.supabase.from("agents").update({ status: "paused" }).neq("slug", "brand");

      if (error) {
        this.logger.error("Failed to pause agents in Supabase", {
          action: "kill_switch_activate",
          error: error.message,
        });
      }
    }

    // Update in-memory state only after DB success
    this.state = {
      active: true,
      activatedAt: new Date().toISOString(),
      activatedBy: userId ?? null,
      source,
    };

    // Pause and drain task queue
    if (this.taskQueue) {
      this.taskQueue.pause();
      const drained = this.taskQueue.drain();
      this.logger.info(`Kill switch drained ${drained.length} queued tasks`, {
        action: "kill_switch_drain",
        details: {
          count: drained.length,
          items: drained.map((d) => ({ id: d.id, agent: d.agentSlug, type: d.task.type })),
        },
      });

      if (this.supabase && drained.length > 0) {
        await logActivity(this.supabase, {
          action: "tasks_drained_by_kill_switch",
          details_json: {
            count: drained.length,
            items: drained.map((d) => ({ queue_id: d.id, agent: d.agentSlug, task_type: d.task.type })),
          },
        });
      }
    }

    this.logger.warn("Kill switch activated", {
      action: "kill_switch_activate",
      status: "success",
      details: { source, userId },
    });

    if (this.supabase) {
      await logActivity(this.supabase, {
        user_id: userId,
        action: "kill_switch_activated",
        details_json: { source },
      });
    }
  }

  async deactivate(source: "slack" | "api" | "realtime", userId?: string): Promise<void> {
    // Write to database FIRST so dashboard (which reads system_settings) stays consistent
    if (this.supabase) {
      const { error: settingsError } = await this.supabase
        .from("system_settings")
        .update({
          value: { active: false },
          updated_at: new Date().toISOString(),
          updated_by: userId ?? null,
        })
        .eq("key", "kill_switch");

      if (settingsError) {
        this.logger.error("Failed to update system_settings for kill switch – aborting deactivation", {
          action: "kill_switch_deactivate",
          error: settingsError.message,
        });
        throw new Error(`Kill switch DB update failed: ${settingsError.message}`);
      }

      const { error } = await this.supabase
        .from("agents")
        .update({ status: "active" })
        .eq("status", "paused")
        .neq("slug", "brand");

      if (error) {
        this.logger.error("Failed to resume agents in Supabase", {
          action: "kill_switch_deactivate",
          error: error.message,
        });
      }
    }

    // Update in-memory state only after DB success
    this.state = {
      active: false,
      activatedAt: null,
      activatedBy: null,
      source: null,
    };

    // Resume task queue
    if (this.taskQueue) {
      this.taskQueue.resume();
    }

    this.logger.info("Kill switch deactivated", {
      action: "kill_switch_deactivate",
      status: "success",
      details: { source, userId },
    });

    if (this.supabase) {
      await logActivity(this.supabase, {
        user_id: userId,
        action: "kill_switch_deactivated",
        details_json: { source },
      });
    }
  }

  async restoreFromDatabase(): Promise<void> {
    if (!this.supabase) return;

    const { data, error } = await this.supabase
      .from("system_settings")
      .select("value, updated_at, updated_by")
      .eq("key", "kill_switch")
      .single();

    if (error) {
      this.logger.warn("Failed to restore kill switch state from database", {
        action: "kill_switch_restore",
        error: error.message,
      });
      return;
    }

    const val = data.value as { active?: boolean } | null;
    if (val?.active) {
      this.state = {
        active: true,
        activatedAt: data.updated_at ?? new Date().toISOString(),
        activatedBy: data.updated_by ?? null,
        source: "restore",
      };

      if (this.taskQueue) {
        this.taskQueue.pause();
      }

      this.logger.warn("Kill switch restored as ACTIVE from database", {
        action: "kill_switch_restore",
        status: "success",
        details: { activated_at: data.updated_at, activated_by: data.updated_by },
      });
    } else {
      this.logger.info("Kill switch restored as inactive from database", {
        action: "kill_switch_restore",
        status: "success",
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
