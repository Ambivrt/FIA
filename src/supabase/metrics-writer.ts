import { SupabaseClient } from "@supabase/supabase-js";

export interface MetricInput {
  category: "content" | "traffic" | "leads" | "cost" | "brand";
  metric_name: string;
  value: number;
  period: "daily" | "weekly" | "monthly";
  period_start: string; // ISO date string (YYYY-MM-DD)
  metadata_json?: Record<string, unknown>;
}

export async function writeMetric(supabase: SupabaseClient, metric: MetricInput): Promise<void> {
  const { error } = await supabase.from("metrics").insert(metric);
  if (error) {
    // Metric write failures are non-fatal – log but don't block task execution
    console.error(`[metrics-writer] Failed to write metric: ${error.message}`, {
      metric_name: metric.metric_name,
      category: metric.category,
    });
  }
}
