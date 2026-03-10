import cron from "node-cron";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "./logger";
import { KillSwitch } from "../utils/kill-switch";
import { logActivity } from "../supabase/activity-writer";

interface ScheduleEntry {
  expression: string;
  agent: string;
  task: string;
  description: string;
}

const SCHEDULE: ScheduleEntry[] = [
  { expression: "0 7 * * 1-5", agent: "analytics", task: "morning_pulse", description: "Analytics morgonpuls" },
  { expression: "0 8 * * 1", agent: "strategy", task: "weekly_planning", description: "Strategy veckoplanering" },
  { expression: "0 9 * * 1,3,5", agent: "content", task: "scheduled_content", description: "Content schemalagt innehåll" },
  { expression: "0 10 * * *", agent: "lead", task: "lead_scoring", description: "Lead scoring-uppdatering" },
  { expression: "0 14 * * 5", agent: "analytics", task: "weekly_report", description: "Analytics veckorapport" },
  // First Monday of month (1st–7th, Monday)
  { expression: "0 9 1-7 * 1", agent: "strategy", task: "monthly_planning", description: "Strategy månadsplanering" },
  // Last Friday of quarter (March, June, September, December)
  { expression: "0 9 25-31 3,6,9,12 5", agent: "analytics", task: "quarterly_review", description: "Analytics kvartalsöversikt" },
];

export function startScheduler(
  config: AppConfig,
  logger: Logger,
  supabase: SupabaseClient | null,
  killSwitch: KillSwitch
): void {
  for (const entry of SCHEDULE) {
    cron.schedule(entry.expression, async () => {
      if (killSwitch.isActive()) {
        logger.info(`Scheduler: skipping ${entry.description} – kill switch active`, {
          action: "schedule_skipped",
          agent: entry.agent,
        });
        return;
      }

      logger.info(`Scheduler: triggering ${entry.description}`, {
        action: "schedule_trigger",
        agent: entry.agent,
        task: entry.task,
      });

      if (supabase) {
        const { data: agent } = await supabase
          .from("agents")
          .select("id, status")
          .eq("slug", entry.agent)
          .single();

        if (agent?.status === "paused") {
          logger.info(`Scheduler: ${entry.agent} is paused, skipping`, {
            action: "schedule_skipped",
            agent: entry.agent,
          });
          return;
        }

        await logActivity(supabase, {
          agent_id: agent?.id,
          action: "schedule_triggered",
          details_json: { task: entry.task, description: entry.description },
        });
      }

      // Agent execution will be wired here when agents are fully implemented
    });
  }

  logger.info(`Scheduler started with ${SCHEDULE.length} cron jobs`, {
    action: "scheduler_start",
    details: { jobs: SCHEDULE.map((s) => s.description) },
  });
}
