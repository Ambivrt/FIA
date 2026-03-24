/**
 * Maps AgentResult.status values to Slack emoji and Swedish status text.
 * Used by scheduler and commands to ensure Slack messages match the actual DB status.
 */
export function formatSlackStatus(status: string): { icon: string; text: string } {
  switch (status) {
    case "completed":
      return { icon: ":white_check_mark:", text: "klar" };
    case "awaiting_review":
      return { icon: ":eyes:", text: "väntar på granskning" };
    case "escalated":
      return { icon: ":warning:", text: "eskalerad" };
    case "error":
      return { icon: ":x:", text: "misslyckades" };
    default:
      return { icon: ":grey_question:", text: status };
  }
}
