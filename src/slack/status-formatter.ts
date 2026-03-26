/**
 * Maps task/agent statuses to Slack emoji and Swedish status text.
 * Covers all 16 TaskStatus values + sub-statuses.
 * Used by scheduler and commands to ensure Slack messages match the actual DB status.
 */
export function formatSlackStatus(status: string, subStatus?: string | null): { icon: string; text: string } {
  switch (status) {
    case "queued":
      return { icon: ":hourglass_flowing_sand:", text: "köad" };
    case "in_progress": {
      const sub = formatSubStatus(subStatus);
      return { icon: ":arrows_counterclockwise:", text: sub ? `pågår (${sub})` : "pågår" };
    }
    case "completed":
      return { icon: ":white_check_mark:", text: "klar" };
    case "awaiting_review":
      return { icon: ":eyes:", text: "väntar på granskning" };
    case "approved":
      return { icon: ":thumbsup:", text: "godkänd" };
    case "rejected":
      return { icon: ":thumbsdown:", text: "avvisad" };
    case "revision_requested":
      return { icon: ":leftwards_arrow_with_hook:", text: "revision begärd" };
    case "delivered":
      return { icon: ":package:", text: "levererad" };
    case "activated":
      return { icon: ":zap:", text: "aktiverad" };
    case "triggered":
      return { icon: ":arrow_right:", text: "triggad" };
    case "acknowledged":
      return { icon: ":ballot_box_with_check:", text: "kvitterad" };
    case "live":
      return { icon: ":large_green_circle:", text: "live" };
    case "paused_task":
      return { icon: ":double_vertical_bar:", text: "pausad" };
    case "ended":
      return { icon: ":stop_button:", text: "avslutad" };
    case "published":
      return { icon: ":newspaper:", text: "publicerad" };
    case "error":
      return { icon: ":x:", text: "misslyckades" };
    default:
      return { icon: ":grey_question:", text: status };
  }
}

/**
 * Maps sub-status values to Swedish display text.
 */
export function formatSubStatus(subStatus?: string | null): string | null {
  if (!subStatus) return null;
  switch (subStatus) {
    // Intelligence
    case "gathering":
      return "samlar data";
    case "analyzing":
      return "analyserar";
    case "compiling":
      return "sammanställer";
    case "awaiting_input":
      return "väntar på input";
    // Content
    case "generating":
      return "genererar";
    case "screening":
      return "varumärkesscreening";
    case "revising":
      return "omgenererar";
    case "brand_reviewing":
      return "brand-granskning";
    // Brand
    case "text_review":
      return "textgranskning";
    case "visual_review":
      return "bildgranskning";
    default:
      return subStatus;
  }
}
