// Canonical mapping of agent slugs → valid user-schedulable task types.
// Must stay in sync with fia-frontend/src/types/fia.ts AGENT_TASK_TYPES.

export const AGENT_TASK_TYPES: Record<string, string[]> = {
  content: [
    "blog_post",
    "linkedin",
    "newsletter",
    "case_study",
    "whitepaper",
    "metadata",
    "alt_text",
    "ab_variants",
    "images",
  ],
  brand: ["default"],
  strategy: ["quarterly_plan", "monthly_plan", "campaign_brief", "research", "trend_analysis"],
  campaign: ["email_sequence", "ad_copy", "landing_page", "ab_variants", "segmentation"],
  seo: ["seo_audit", "keyword_research", "bulk_optimization", "content_recommendations"],
  lead: ["lead_scoring", "nurture_email", "nurture_sequences"],
  analytics: ["morning_pulse", "weekly_report", "quarterly_review", "anomaly_detection"],
  intelligence: [
    "morning_scan",
    "midday_sweep",
    "weekly_intelligence",
    "directed_research",
    "competitor_deep_dive",
    "trend_analysis",
    "company_industry_analysis",
    "tech_watch",
    "talent_intel",
  ],
};

// Task types created only by triggers (not user-schedulable).
export const TRIGGER_TASK_TYPES = [
  "rapid_response_article",
  "strategic_input",
  "campaign_content",
  "campaign_setup",
  "seo_optimization",
  "rapid_response",
] as const;

/** Check if a task_type is valid for a given agent slug (schedulable OR trigger-created). */
export function isValidTaskType(agentSlug: string, taskType: string): boolean {
  const schedulable = AGENT_TASK_TYPES[agentSlug];
  if (schedulable && schedulable.includes(taskType)) return true;
  if ((TRIGGER_TASK_TYPES as readonly string[]).includes(taskType)) return true;
  return false;
}

/** Check if a task_type is user-schedulable for a given agent slug. */
export function isSchedulableTaskType(agentSlug: string, taskType: string): boolean {
  const schedulable = AGENT_TASK_TYPES[agentSlug];
  return !!schedulable && schedulable.includes(taskType);
}
