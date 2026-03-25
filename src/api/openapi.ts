import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// ── Common schemas ──

const errorResponse = registry.register(
  "ErrorResponse",
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
);

const paginationMeta = registry.register(
  "PaginationMeta",
  z.object({
    total: z.number(),
    page: z.number(),
    per_page: z.number(),
  }),
);

// ── Agent schemas ──

const modelAliasEnum = z.enum([
  "claude-opus",
  "claude-sonnet",
  "gemini-pro",
  "gemini-flash",
  "nano-banana-2",
  "google-search",
]);

const routingSchema = registry.register(
  "RoutingConfig",
  z.object({
    routing: z.record(
      z.string(),
      z.union([
        modelAliasEnum,
        z.object({
          primary: modelAliasEnum,
          fallback: modelAliasEnum.optional(),
        }),
      ]),
    ),
  }),
);

const toolsSchema = registry.register(
  "ToolsConfig",
  z.object({
    tools: z.array(z.string()),
  }),
);

// ── Trigger schemas ──

const triggerConditionPatch = z
  .object({
    task_type: z.union([z.string(), z.array(z.string())]).optional(),
    output_field: z.string().optional(),
    output_value: z.union([z.string(), z.array(z.string())]).optional(),
    score_field: z.string().optional(),
    score_above: z.number().min(0).max(1).optional(),
  })
  .optional();

const triggerActionPatch = z
  .object({
    target_agent: z.string().optional(),
    task_type: z.string().optional(),
    priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
    context_fields: z.array(z.string()).optional(),
    channel: z.string().optional(),
  })
  .optional();

const triggerPatchItem = z.object({
  name: z.string(),
  enabled: z.boolean().optional(),
  requires_approval: z.boolean().optional(),
  condition: triggerConditionPatch,
  action: triggerActionPatch,
});

const triggersPatchSchema = registry.register(
  "TriggersPatch",
  z.object({
    triggers: z.array(triggerPatchItem).min(1).max(20),
  }),
);

const reseedSchema = registry.register(
  "ReseedRequest",
  z.object({
    confirm: z.boolean().optional(),
  }),
);

// ── Task schemas ──

const createTaskSchema = registry.register(
  "CreateTask",
  z.object({
    agent_slug: z.string(),
    type: z.string(),
    title: z.string().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  }),
);

const approveSchema = registry.register(
  "ApproveTask",
  z.object({
    feedback: z.string().optional(),
  }),
);

const rejectSchema = registry.register(
  "RejectTask",
  z.object({
    feedback: z.string().min(1),
  }),
);

const revisionSchema = registry.register(
  "RevisionRequest",
  z.object({
    feedback: z.string().min(1),
  }),
);

const statusChangeSchema = registry.register(
  "StatusChange",
  z.object({
    status: z.string().min(1),
  }),
);

// ── Kill switch schema ──

const killSwitchSchema = registry.register(
  "KillSwitchAction",
  z.object({
    action: z.enum(["activate", "deactivate"]),
  }),
);

// ── Knowledge schema ──

const knowledgeReseedSchema = registry.register(
  "KnowledgeReseed",
  z.object({
    confirm: z.boolean().optional(),
    agent_slug: z.string().optional(),
  }),
);

// ── Trigger reject schema ──

const triggerRejectSchema = registry.register(
  "TriggerReject",
  z.object({
    reason: z.string().min(1),
  }),
);

// ═══════════════════════════════════════════
// PATHS
// ═══════════════════════════════════════════

// ── Health ──

registry.registerPath({
  method: "get",
  path: "/api/health",
  summary: "Hälsokontroll",
  tags: ["System"],
  responses: {
    200: { description: "Systemet lever" },
  },
});

// ── Agents ──

registry.registerPath({
  method: "get",
  path: "/api/agents",
  summary: "Lista alla agenter",
  description: "Returnerar alla agenter med display_status och tasks_today.",
  tags: ["Agenter"],
  responses: {
    200: { description: "Lista av agenter med daglig statistik" },
    500: { description: "Internt fel" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{slug}/pause",
  summary: "Pausa en agent",
  tags: ["Agenter"],
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: { description: "Agent pausad" },
    404: { description: "Agent ej hittad" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{slug}/resume",
  summary: "Återuppta en pausad agent",
  tags: ["Agenter"],
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: { description: "Agent återupptagen" },
    404: { description: "Agent ej hittad" },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/agents/{slug}/routing",
  summary: "Uppdatera routing-konfiguration",
  description: "Ändra modellval per uppgiftstyp. Kräver admin-roll.",
  tags: ["Agenter"],
  request: {
    params: z.object({ slug: z.string() }),
    body: { content: { "application/json": { schema: routingSchema } } },
  },
  responses: {
    200: { description: "Routing uppdaterad" },
    404: { description: "Agent ej hittad" },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/agents/{slug}/tools",
  summary: "Uppdatera verktyg",
  description: "Ändra MCP-verktyg för en agent. Kräver admin-roll.",
  tags: ["Agenter"],
  request: {
    params: z.object({ slug: z.string() }),
    body: { content: { "application/json": { schema: toolsSchema } } },
  },
  responses: {
    200: { description: "Verktyg uppdaterade" },
    404: { description: "Agent ej hittad" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/agents/{slug}/triggers",
  summary: "Hämta triggers för en agent",
  tags: ["Agenter"],
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: { description: "Lista av triggers" },
    404: { description: "Agent ej hittad" },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/agents/{slug}/triggers",
  summary: "Uppdatera trigger-konfiguration",
  description: "Ändra enabled, requires_approval, condition eller action på triggers.",
  tags: ["Agenter"],
  request: {
    params: z.object({ slug: z.string() }),
    body: { content: { "application/json": { schema: triggersPatchSchema } } },
  },
  responses: {
    200: { description: "Triggers uppdaterade" },
    404: { description: "Trigger ej hittad" },
    400: { description: "Valideringsfel" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{slug}/triggers/reseed",
  summary: "Reseed triggers från agent.yaml",
  description: "Skriver över dashboard-konfiguration med YAML-filen. Stöder dry_run (confirm: false).",
  tags: ["Agenter"],
  request: {
    params: z.object({ slug: z.string() }),
    body: { content: { "application/json": { schema: reseedSchema } } },
  },
  responses: {
    200: { description: "Reseed utförd eller dry-run diff" },
    404: { description: "Agent ej hittad" },
  },
});

// ── Tasks ──

registry.registerPath({
  method: "get",
  path: "/api/tasks",
  summary: "Lista tasks",
  description: "Filtrering på status (kommaseparerat), agent_slug, type, priority. Stöder paginering och sortering.",
  tags: ["Tasks"],
  request: {
    query: z.object({
      status: z.string().optional(),
      agent_slug: z.string().optional(),
      type: z.string().optional(),
      priority: z.string().optional(),
      page: z.string().optional(),
      per_page: z.string().optional(),
      sort: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Paginerad lista med tasks" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks",
  summary: "Skapa ny task",
  description: "Skapar en task i kön. Kräver orchestrator, admin eller operator.",
  tags: ["Tasks"],
  request: {
    body: { content: { "application/json": { schema: createTaskSchema } } },
  },
  responses: {
    201: { description: "Task skapad" },
    404: { description: "Agent ej hittad" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}",
  summary: "Hämta en task",
  description: "Returnerar task med tillhörande approvals.",
  tags: ["Tasks"],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: "Task med approvals" },
    404: { description: "Task ej hittad" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/approve",
  summary: "Godkänn en task",
  tags: ["Tasks"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: approveSchema } } },
  },
  responses: {
    200: { description: "Task godkänd" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/reject",
  summary: "Avslå en task",
  tags: ["Tasks"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: rejectSchema } } },
  },
  responses: {
    200: { description: "Task avslagen" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/revision",
  summary: "Begär revision av en task",
  tags: ["Tasks"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: revisionSchema } } },
  },
  responses: {
    200: { description: "Revision begärd" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/status",
  summary: "Ändra taskstatus",
  description: "Generell statusändring med validering mot statusmaskin.",
  tags: ["Tasks"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: statusChangeSchema } } },
  },
  responses: {
    200: { description: "Status ändrad" },
    400: { description: "Ogiltig övergång" },
    404: { description: "Task ej hittad" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}/children",
  summary: "Hämta child tasks",
  tags: ["Tasks"],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: "Lista av child tasks" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}/lineage",
  summary: "Hämta task lineage",
  description: "Returnerar ancestors och children (max 5 nivåer upp).",
  tags: ["Tasks"],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: "Ancestors och children" },
  },
});

// ── Metrics ──

registry.registerPath({
  method: "get",
  path: "/api/metrics",
  summary: "Hämta metrics",
  description: "Filtrering på category, period, from, to.",
  tags: ["Metrics"],
  request: {
    query: z.object({
      category: z.string().optional(),
      period: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Lista av metrics" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/metrics/summary",
  summary: "KPI-sammanfattning",
  description: "Returnerar content_this_week, approval_rate, pending_approvals, cost_mtd_sek, cost_trend.",
  tags: ["Metrics"],
  responses: {
    200: { description: "KPI-sammanfattning" },
  },
});

// ── Activity ──

registry.registerPath({
  method: "get",
  path: "/api/activity",
  summary: "Aktivitetslogg",
  description: "Audit trail med filtrering på agent, action, datum, sökning. Paginerad.",
  tags: ["Aktivitet"],
  request: {
    query: z.object({
      agent_slug: z.string().optional(),
      action: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      search: z.string().optional(),
      page: z.string().optional(),
      per_page: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Paginerad aktivitetslogg" },
  },
});

// ── Kill Switch ──

registry.registerPath({
  method: "get",
  path: "/api/kill-switch/status",
  summary: "Kill switch-status",
  tags: ["Kill Switch"],
  responses: {
    200: { description: "Kill switch-status" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/kill-switch",
  summary: "Aktivera/deaktivera kill switch",
  tags: ["Kill Switch"],
  request: {
    body: { content: { "application/json": { schema: killSwitchSchema } } },
  },
  responses: {
    200: { description: "Kill switch uppdaterad" },
  },
});

// ── Triggers (pending) ──

registry.registerPath({
  method: "get",
  path: "/api/triggers/pending",
  summary: "Lista pending triggers",
  tags: ["Triggers"],
  responses: {
    200: { description: "Lista av pending triggers" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/triggers/{id}/approve",
  summary: "Godkänn en pending trigger",
  description: "Skapar downstream task och uppdaterar trigger-status.",
  tags: ["Triggers"],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: "Trigger godkänd, ny task skapad" },
    404: { description: "Trigger ej hittad" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/triggers/{id}/reject",
  summary: "Avslå en pending trigger",
  tags: ["Triggers"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: triggerRejectSchema } } },
  },
  responses: {
    200: { description: "Trigger avslagen" },
    404: { description: "Trigger ej hittad" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/triggers/reseed",
  summary: "Reseed alla agenters triggers",
  description: "Skriver över alla agenters trigger-konfiguration från agent.yaml. Stöder dry_run.",
  tags: ["Triggers"],
  request: {
    body: { content: { "application/json": { schema: reseedSchema } } },
  },
  responses: {
    200: { description: "Reseed utförd eller dry-run diff" },
  },
});

// ── Knowledge ──

registry.registerPath({
  method: "post",
  path: "/api/knowledge/reseed",
  summary: "Reseed kunskapsbas",
  description: "Seedar knowledge items från disk till Supabase. Stöder dry_run och enskild agent.",
  tags: ["Knowledge"],
  request: {
    body: { content: { "application/json": { schema: knowledgeReseedSchema } } },
  },
  responses: {
    200: { description: "Reseed utförd eller dry-run diff" },
  },
});

// ═══════════════════════════════════════════
// GENERATE SPEC
// ═══════════════════════════════════════════

const generator = new OpenApiGeneratorV3(registry.definitions);
export const openApiSpec = generator.generateDocument({
  openapi: "3.0.3",
  info: {
    title: "FIA Gateway API",
    version: "0.5.5",
    description:
      "REST API för Forefront Intelligent Automation. Internt API – exponeras ej mot internet. Autentisering via JWT (Supabase Auth) eller FIA_CLI_TOKEN.",
  },
  servers: [{ url: "http://localhost:3001", description: "Lokal gateway" }],
  tags: [
    { name: "System", description: "Hälsokontroll" },
    { name: "Agenter", description: "Agenthantering och konfiguration" },
    { name: "Tasks", description: "Task-hantering och godkännandeflöde" },
    { name: "Metrics", description: "KPI och kostnadsdata" },
    { name: "Aktivitet", description: "Audit trail" },
    { name: "Kill Switch", description: "Nödbroms" },
    { name: "Triggers", description: "Pending triggers och reseed" },
    { name: "Knowledge", description: "Kunskapsbas" },
  ],
  security: [{ bearerAuth: [] }],
});

// Add security scheme manually (zod-to-openapi doesn't handle this well)
const spec = openApiSpec as unknown as Record<string, unknown>;
spec.components = {
  ...(spec.components as Record<string, unknown>),
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "Supabase JWT eller FIA_CLI_TOKEN",
    },
  },
};
