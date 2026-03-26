# src/ – FIA Gateway källkod

## Arkitektur

Gateway är en persistent Node.js-daemon (PM2) som orkestrerar åtta AI-agenter. Ingen inkommande trafik – Slack via Socket Mode (utgående websocket), Supabase via klient.

```
index.ts → gateway/gateway.ts (huvudklass)
  ├── agents/       – agent-loader läser agent.yaml → base-agent → specifik agent
  ├── gateway/      – router (modellval), scheduler (cron), logger (audit), task-queue
  ├── engine/       – status-machine.ts (övergångsvalidering), trigger-engine.ts (deklarativ)
  ├── llm/          – claude.ts (Opus/Sonnet), nano-banana.ts (bild), google-search.ts (Serper)
  ├── slack/        – Bolt SDK app, commands (/fia), handlers, channels, auth.ts (roll-lookup)
  ├── supabase/     – client, heartbeat, task-writer, metrics-writer, activity-writer, command-listener
  ├── api/          – Express REST API (internt), routes, JWT auth, permissions.ts
  ├── mcp/          – Tunna wrappers: gws.ts, drive-setup.ts, drive-structure.ts, tool-registry.ts
  ├── context/      – context-manager (läser kunskapsbas), prompt-builder (systemprompt)
  ├── knowledge/    – knowledge-seeder.ts (seed YAML/disk → Supabase agent_knowledge)
  ├── shared/       – display-status.ts, task-types.ts, cron-service.ts
  └── utils/        – config (.env), errors, kill-switch
```

## Viktiga filer

| Fil                             | Kritisk | Beskrivning                                                                     |
| ------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `gateway/router.ts`             | JA      | Multi-modell-routing. Läser agent.yaml routing-fält. Stöder primary/fallback.   |
| `gateway/logger.ts`             | JA      | Strukturerad JSON-loggning (audit trail). Varje agentbeslut loggas.             |
| `agents/agent-loader.ts`        | JA      | Läser agent.yaml, resolvar filer, bygger systemprompt + task_context.           |
| `agents/base-agent.ts`          | JA      | Abstrakt basklass – execute(), getSystemPrompt(), escalate(), writeMemory().    |
| `engine/status-machine.ts`      | JA      | Tillåtna statusövergångar, validering. 17 statusar.                             |
| `engine/trigger-engine.ts`      | JA      | Deklarativ trigger-matching. Läser config_json.triggers från Supabase.          |
| `api/permissions.ts`            | –       | `hasPermission()` + `requirePermission()` middleware. 5 roller, 18 permissions. |
| `knowledge/knowledge-seeder.ts` | –       | Seed skills, context, memory från disk → Supabase agent_knowledge.              |
| `llm/claude.ts`                 | –       | Anthropic SDK-klient (Opus 4.6 + Sonnet 4.6). tool_use för strukturerad output. |

## Kodmönster

### Agent-implementering

Alla agenter ärver `BaseAgent`. Manifest (`agent.yaml`) styr routing, tools och kontext.

```typescript
// Ny agent: skapa src/agents/<slug>/<slug>-agent.ts
export class FooAgent extends BaseAgent {
  name = "Foo Agent";
  slug = "foo";

  async execute(task: AgentTask): Promise<AgentResult> {
    const systemPrompt = this.getSystemPrompt();
    const taskContext = this.getTaskContext(task.type);
    // LLM-anrop via router...
  }
}
```

### LLM-anrop

Alla LLM-anrop wrappas i try/catch. Routern bestämmer modell baserat på agent.yaml.

```typescript
const model = router.getModel(agent.slug, taskType); // → 'claude-opus' | 'claude-sonnet' | etc.
```

### Loggformat

Varje agentbeslut loggas som strukturerad JSON:

```json
{
  "timestamp": "ISO-8601",
  "agent": "content",
  "task_id": "uuid",
  "model": "claude-opus-4-6",
  "action": "generate_blog_post",
  "tokens_in": 1234,
  "tokens_out": 5678,
  "cost_usd": 0.023,
  "duration_ms": 3400,
  "status": "success|error|escalated",
  "brand_review": "approved|rejected|pending"
}
```

### Strukturerad output (tool_use)

| Verktyg                 | Agent                   | Syfte                                                  |
| ----------------------- | ----------------------- | ------------------------------------------------------ |
| `content_response`      | Content, Campaign, Lead | Strukturerad content-output (title, body, summary)     |
| `brand_review_decision` | Brand                   | Granskningsbeslut (approved/rejected, feedback, scores) |
| `signal_scoring`        | Intelligence            | Signalscoring (4 dimensioner)                          |
| `deep_analysis`         | Intelligence            | Djupanalys (summary, implications, suggested_action)   |

## REST API (internt)

Exponeras INTE mot internet. Dashboard kommunicerar via Supabase. CLI via `FIA_CLI_TOKEN`.

Auth: `Authorization: Bearer <supabase-jwt|FIA_CLI_TOKEN>`, valideras mot Supabase Auth + profiles.role.

### Agenter

- `GET /api/agents` – Alla inloggade. Alla åtta med status, heartbeat, routing, tools.
- `GET /api/agents/:slug` – Alla inloggade. Utökad info inkl. config_json.
- `POST /api/agents/:slug/pause|resume` – Orchestrator, Admin.
- `PUT /api/agents/:slug/config` – Admin. Body: `{ "config_json": { ... } }`
- `PATCH /api/agents/:slug/routing` – Admin. Zod-validerad. Stöder primary/fallback.
- `PATCH /api/agents/:slug/tools` – Admin. Body: `{ "tools": ["gws:drive", ...] }`

### Uppgifter

- `GET /api/tasks` – Filter: `status` (kommaseparerad), `agent_slug`, `type`, `priority`, `page`, `per_page`, `sort`.
- `GET /api/tasks/:id` – Med content_json och approvals.
- `POST /api/tasks` – Orchestrator, Admin, Reviewer. Skapar task med status `queued`.
- `POST /api/tasks/:id/approve|reject|revision` – Orchestrator, Admin, Reviewer.
- `POST /api/tasks/:id/status` – Generellt endpoint för statusändringar. Validerar mot övergångstabellen.
- `GET /api/tasks/:id/children` – Downstream tasks.
- `GET /api/tasks/:id/lineage` – Ancestors + children (max 5 nivåer).

### Triggers

- `GET /api/triggers/pending` – Orchestrator, Admin.
- `POST /api/triggers/:id/approve|reject` – Orchestrator, Admin.
- `GET /api/agents/:slug/triggers` – Alla inloggade.
- `PATCH /api/agents/:slug/triggers` – Orchestrator, Admin. Partiell uppdatering.
- `POST /api/agents/:slug/triggers/reseed` – Admin. Dry-run/confirm-mönster.
- `POST /api/triggers/reseed` – Admin. Alla agenters triggers.

### Metrics, aktivitet, kill switch

- `GET /api/metrics` + `GET /api/metrics/summary`
- `GET /api/activity` – Filter: agent_slug, action, from, to, search.
- `POST /api/kill-switch` – Orchestrator, Admin. `{ "action": "activate"|"deactivate" }`
- `GET /api/kill-switch/status`

### Drive & Knowledge

- `GET /api/drive/status` – Drive-mappstruktur och folder-IDs.
- `POST /api/drive/setup` – Admin. Stöder dry_run.
- `GET /api/knowledge` – Lista knowledge items med filter.
- `POST /api/knowledge/reseed` – Admin. Dry-run/confirm-mönster.

## Slack-kommandon

| Kommando                   | Roll          | Beskrivning              |
| -------------------------- | ------------- | ------------------------ |
| `/fia status`              | Alla          | Systemstatus             |
| `/fia kill`                | Orchestrator+ | Aktivera kill switch     |
| `/fia resume`              | Orchestrator+ | Avaktivera kill switch   |
| `/fia run <agent> <task>`  | Orchestrator+ | Manuell trigger          |
| `/fia approve\|reject <id>` | Orchestrator+ | Godkänn/avslå            |
| `/fia queue`               | Alla          | Köade uppgifter          |
| `/fia purge`               | Orchestrator+ | Rensa föräldralösa tasks |
| `/fia drive status\|setup`  | Admin (setup) | Drive-mappstruktur       |
| `/fia costs`               | Alla          | Kostnadsöversikt         |
| `/fia whoami`              | Alla          | Roll och permissions     |
| `/fia help`                | Alla          | Alla kommandon           |

## Schemalagda uppgifter

| Tid                    | Agent        | Uppgift             | Cron                   |
| ---------------------- | ------------ | ------------------- | ---------------------- |
| 06:30 mån–fre          | Intelligence | Morgonscan          | `30 6 * * 1-5`         |
| 07:00 mån–fre          | Analytics    | Morgonpuls          | `0 7 * * 1-5`          |
| 08:00 måndag           | Strategy     | Veckoplanering      | `0 8 * * 1`            |
| 09:00 mån/ons/fre      | Content      | Schemalagt innehåll | `0 9 * * 1,3,5`        |
| 09:00 måndag           | Intelligence | Veckobriefing       | `0 9 * * 1`            |
| 10:00 dagligen         | Lead         | Lead scoring        | `0 10 * * *`           |
| 13:00 mån–fre          | Intelligence | Middagssweep        | `0 13 * * 1-5`         |
| 14:00 fredag           | Analytics    | Veckorapport        | `0 14 * * 5`           |
| 09:00 första måndagen  | Strategy     | Månadsplanering     | `0 9 1-7 * 1`          |
| 09:00 sista fredagen Q | Analytics    | Kvartalsöversikt    | `0 9 25-31 3,6,9,12 5` |

Alla schemalagda tasks respekterar kill switch och agent-pausstatus.
