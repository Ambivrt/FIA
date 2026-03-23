// CLI-specifika typer – importerar delade typer från gateway

export { DisplayStatus, DisplayStatusResult } from "../src/shared/display-status";

// API-svarstyper

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export interface AgentResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  autonomy_level: string;
  last_heartbeat: string | null;
  config_json: Record<string, unknown> | null;
  created_at: string;
  tasks_today: Record<string, number>;
  running_task_count: number;
  display_status: {
    status: string;
    label: string;
    labelSv: string;
    color: string;
    symbol: string;
  };
}

export interface TaskResponse {
  id: string;
  agent_id: string;
  type: string;
  title: string;
  status: string;
  priority: string;
  content_json: Record<string, unknown> | null;
  model_used: string | null;
  tokens_used: number | null;
  cost_sek: number | null;
  created_at: string;
  completed_at: string | null;
  agents?: {
    slug: string;
    name: string;
  };
  approvals?: ApprovalResponse[];
}

export interface ApprovalResponse {
  id: string;
  task_id: string;
  reviewer_type: string;
  reviewer_id: string | null;
  decision: string;
  feedback: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  agent_id: string | null;
  user_id: string | null;
  action: string;
  details_json: Record<string, unknown> | null;
  created_at: string;
  agents?: {
    slug: string;
    name: string;
  } | null;
}

export interface KillSwitchStatus {
  active: boolean;
  activated_at?: string;
  activated_by?: string;
  source?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    per_page: number;
  };
}

export interface PendingTrigger {
  id: string;
  source_task_id: string;
  trigger_name: string;
  target_agent_slug: string;
  target_task_type: string;
  priority: string;
  context_json: Record<string, unknown> | null;
  status: "pending" | "executed" | "rejected";
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  tasks?: {
    id: string;
    title: string;
    type: string;
    status: string;
    agents?: { slug: string; name: string } | null;
  } | null;
}

export interface TriggerConfig {
  name: string;
  on: string;
  enabled: boolean;
  requires_approval: boolean;
  condition?: {
    task_type?: string | string[];
    output_field?: string;
    output_value?: string | string[];
    score_field?: string;
    score_above?: number;
  };
  action: {
    type: "create_task" | "notify_slack" | "escalate" | "update_config";
    target_agent?: string;
    task_type?: string;
    priority?: string;
    context_fields?: string[];
    channel?: string;
  };
}

export interface LineageTask {
  id: string;
  title: string;
  type: string;
  status: string;
  trigger_source: string | null;
  parent_task_id?: string | null;
  agents?: { slug: string; name: string } | null;
}
