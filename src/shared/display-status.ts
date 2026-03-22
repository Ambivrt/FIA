export type DisplayStatus = "online" | "working" | "paused" | "killed" | "error";

export interface DisplayStatusResult {
  status: DisplayStatus;
  label: string;
  labelSv: string;
  color: string;
  symbol: string;
}

const CONFIG: Record<DisplayStatus, Omit<DisplayStatusResult, "status">> = {
  online: { label: "Online", labelSv: "Redo", color: "#22c55e", symbol: "●" },
  working: { label: "Working", labelSv: "Arbetar", color: "#eab308", symbol: "●" },
  paused: { label: "Paused", labelSv: "Pausad", color: "#9ca3af", symbol: "●" },
  killed: { label: "Killed", labelSv: "Avstängd", color: "#000000", symbol: "⬤" },
  error: { label: "Error", labelSv: "Fel", color: "#ef4444", symbol: "✗" },
};

export function resolveDisplayStatus(
  agent: { status: string },
  killSwitchActive: boolean,
  agentHasRunningTask: boolean,
): DisplayStatusResult {
  let ds: DisplayStatus;
  if (killSwitchActive) ds = "killed";
  else if (agent.status === "error") ds = "error";
  else if (agent.status === "paused") ds = "paused";
  else if (agentHasRunningTask) ds = "working";
  else ds = "online";

  return { status: ds, ...CONFIG[ds] };
}
