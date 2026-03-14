# src/ – FIA Gateway källkod

## Arkitektur

Gateway är en persistent Node.js-daemon (PM2) som orkestrerar sju AI-agenter. Ingen inkommande trafik – Slack via Socket Mode (utgående websocket), Supabase via klient.

```
index.ts → gateway/gateway.ts (huvudklass)
  ├── agents/       – agent-loader läser agent.yaml → base-agent → specifik agent
  ├── gateway/      – router (modellval), scheduler (cron), logger (audit), task-queue
  ├── llm/          – claude.ts (Opus/Sonnet), nano-banana.ts (bild), google-search.ts (Serper)
  ├── slack/        – Bolt SDK app, commands (/fia), handlers, channels
  ├── supabase/     – client, heartbeat, task-writer, metrics-writer, activity-writer, command-listener
  ├── api/          – Express REST API (internt), routes (agents, tasks, metrics, kill-switch), JWT auth
  ├── mcp/          – Tunna wrappers: wordpress.ts, hubspot.ts, linkedin.ts, buffer.ts
  ├── context/      – context-manager (läser kunskapsbas), prompt-builder (systemprompt)
  └── utils/        – config (.env), errors, kill-switch
```

## Viktiga filer

| Fil | Kritisk | Beskrivning |
|-----|---------|-------------|
| `gateway/router.ts` | JA | Multi-modell-routing. Läser agent.yaml routing-fält. Granska manuellt vid ändringar. |
| `gateway/logger.ts` | JA | Strukturerad JSON-loggning (audit trail). Varje agentbeslut loggas. |
| `agents/agent-loader.ts` | JA | Läser agent.yaml, resolvar filer, bygger systemprompt + task_context. |
| `agents/base-agent.ts` | JA | Abstrakt basklass – execute(), getSystemPrompt(), escalate(), writeMemory(). |
| `mcp/wordpress.ts` | JA | MCP-wrapper, granska manuellt. |
| `llm/claude.ts` | – | Anthropic SDK-klient (Opus 4.6 + Sonnet 4.6). |
| `supabase/client.ts` | – | Supabase-klient med service role key. |

## Kodmönster

### Agent-implementering

Alla agenter ärver `BaseAgent`. Manifest (`agent.yaml`) styr routing, tools och kontext.

```typescript
// Ny agent: skapa src/agents/<slug>/<slug>-agent.ts
export class FooAgent extends BaseAgent {
  name = 'Foo Agent';
  slug = 'foo';

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
// router.ts bestämmer modell
const model = router.getModel(agent.slug, taskType); // → 'claude-opus' | 'claude-sonnet' | etc.
```

### Loggformat

Varje agentbeslut loggas som strukturerad JSON:

```json
{
  "timestamp": "ISO-8601",
  "agent": "content",
  "task_id": "uuid",
  "model": "claude-opus-4-20250514",
  "action": "generate_blog_post",
  "tokens_in": 1234,
  "tokens_out": 5678,
  "cost_usd": 0.023,
  "duration_ms": 3400,
  "status": "success|error|escalated",
  "brand_review": "approved|rejected|pending"
}
```

## REST API (internt)

Exponeras INTE mot internet. Dashboard kommunicerar via Supabase Edge Functions.

- `GET /api/agents` – Lista agenter med status
- `POST /api/agents/:slug/pause|resume` – Orchestrator/Admin
- `GET /api/tasks` – Lista uppgifter (filter: status, agent, type, priority)
- `POST /api/tasks/:id/approve|reject|revision` – Orchestrator/Admin
- `GET /api/metrics` + `GET /api/metrics/summary` – KPI-data
- `GET /api/activity` – Audit trail
- `POST /api/kill-switch` – Nödbroms

Auth: `Authorization: Bearer <supabase-jwt>`, valideras mot Supabase Auth + profiles.role.

## Slack-kommandon

- `/fia status` – Systemstatus
- `/fia kill` / `/fia resume` – Kill switch
- `/fia run <agent> <uppgift>` – Manuell trigger
- `/fia approve|reject <task-id>` – Godkänn/avslå

## Schemalagda uppgifter

| Tid | Agent | Uppgift |
|-----|-------|---------|
| 07:00 mån-fre | Analytics | Morgonpuls |
| 08:00 måndag | Strategy | Veckoplanering |
| 09:00 mån/ons/fre | Content | Schemalagt innehåll |
| 10:00 dagligen | Lead | Lead scoring |
| 14:00 fredag | Analytics | Veckorapport |
