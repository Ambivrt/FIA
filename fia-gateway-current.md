# FIA Gateway – Funktionsspec (nuläge)

**Version:** 0.2.0
**Datum:** 2026-03-12
**Källa:** Faktisk kodbas (41 TypeScript-filer), inte aspirationell dokumentation.

---

## 1. Översikt

FIA Gateway är en persistent Node.js-daemon som orkestrerar sju AI-agentkluster för Forefronts marknadsavdelning. Gatewayen hanterar:

- Multi-modell LLM-routing (Gemini, Claude, Google Search, bildgenerering)
- Manifest-driven agentexekvering med YAML-konfiguration
- Dubbelt kommandogränssnitt: Slack (Socket Mode) + REST API
- Supabase-integration för datalagring och Realtime-kommandon
- Cron-baserad schemaläggning av agentuppgifter
- Kill switch med dual-aktivering (Slack + Dashboard)

**Runtime:** Node.js ≥ 20, TypeScript strict mode, PM2 som processhanterare.

---

## 2. Teknikstack (faktiska beroenden)

| Paket                   | Version | Syfte                                               |
| ----------------------- | ------- | --------------------------------------------------- |
| `@google/genai`         | ^1.0.0  | Gemini 2.5 Pro/Flash + Nano Banana 2 bildgenerering |
| `@anthropic-ai/sdk`     | ^0.39.0 | Claude Opus 4.6 / Sonnet 4.6                        |
| `@slack/bolt`           | ^4.1.0  | Slack-bot (Socket Mode)                             |
| `@supabase/supabase-js` | ^2.49.0 | Supabase-klient (databas, auth, realtime)           |
| `express`               | ^4.21.0 | REST API                                            |
| `node-cron`             | ^3.0.3  | Cron-schemaläggning                                 |
| `yaml`                  | ^2.7.0  | Parsning av agent.yaml-manifest                     |
| `uuid`                  | ^11.1.0 | UUID-generering                                     |
| `dotenv`                | ^16.4.7 | Miljövariabelladdning                               |

**Dev:** TypeScript ^5.9.3, Jest ^29.7.0, ts-node, nodemon.

---

## 3. Startsekvens

**Fil:** `src/index.ts`

```
main()
  ├── loadConfig()                    – Läser .env, returnerar AppConfig
  ├── createLogger(config)            – Skapar JSON-logger (fil + stdout)
  ├── createSupabaseClient(config)    – Om SUPABASE_URL + SERVICE_ROLE_KEY finns
  │   └── startHeartbeat(supabase)    – Uppdaterar agents.last_heartbeat var 60s
  ├── KillSwitch(supabase, logger)    – In-memory kill switch-state
  ├── createSlackApp(...)             – Om SLACK_BOT_TOKEN + SLACK_APP_TOKEN finns
  ├── createApiServer(...)            – Om Supabase är konfigurerat
  │   └── startApiServer(port)        – Default port 3001
  ├── startCommandListener(...)       – Supabase Realtime på commands-tabellen
  ├── startScheduler(...)             – 7 cron-jobb
  └── setInterval(60s)                – Håller processen vid liv för PM2
```

Graceful shutdown hanteras via SIGTERM/SIGINT.

---

## 4. Konfiguration

**Fil:** `src/utils/config.ts`

`loadConfig()` läser 22 miljövariabler via `dotenv` och returnerar `AppConfig`:

| Variabel                                | Default         | Krävs för                        |
| --------------------------------------- | --------------- | -------------------------------- |
| `NODE_ENV`                              | `"development"` | Allmänt                          |
| `LOG_DIR`                               | `./logs`        | Loggning                         |
| `LOG_LEVEL`                             | `"info"`        | Loggning (debug/info/warn/error) |
| `KNOWLEDGE_DIR`                         | `./knowledge`   | Kunskapsbas                      |
| `ANTHROPIC_API_KEY`                     | `""`            | Claude LLM                       |
| `GEMINI_API_KEY`                        | `""`            | Gemini LLM + Nano Banana 2       |
| `SERPER_API_KEY`                        | `""`            | Google Search via Serper         |
| `SLACK_BOT_TOKEN`                       | `""`            | Slack-bot                        |
| `SLACK_APP_TOKEN`                       | `""`            | Slack Socket Mode                |
| `SLACK_SIGNING_SECRET`                  | `""`            | Slack                            |
| `SUPABASE_URL`                          | `""`            | Supabase                         |
| `SUPABASE_SERVICE_ROLE_KEY`             | `""`            | Supabase (server-side)           |
| `SUPABASE_ANON_KEY`                     | `""`            | Supabase (publik)                |
| `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` | `""`            | gws CLI (ej implementerat)       |
| `HUBSPOT_API_KEY`                       | `""`            | HubSpot MCP (ej implementerat)   |
| `LINKEDIN_ACCESS_TOKEN`                 | `""`            | LinkedIn MCP (ej implementerat)  |
| `GA4_CREDENTIALS_PATH`                  | `""`            | GA4 (ej implementerat)           |
| `BUFFER_ACCESS_TOKEN`                   | `""`            | Buffer (ej implementerat)        |
| `GATEWAY_API_PORT`                      | `3001`          | REST API                         |

Alla saknade variabler defaultar till tomma strängar – ingen validering sker vid uppstart.

---

## 5. Loggning

**Fil:** `src/gateway/logger.ts`

- **Format:** JSON Lines (strukturerat), en rad per logginlägg
- **Output:** Dubbel – fil (`{LOG_DIR}/fia-gateway.log`) + stdout
- **Nivåer:** debug (0), info (1), warn (2), error (3) – filtrerat via `LOG_LEVEL`
- **Skapar logkatalogen** automatiskt om den saknas
- **Interface:** `Logger` med `info()`, `warn()`, `error()`, `debug()` – varje metod tar `message: string` + valfritt `Record<string, unknown>`

---

## 6. LLM-klienter

### 6.1 Modellkarta

**Fil:** `src/llm/types.ts`

| Alias           | Modell-ID                                   | Leverantör |
| --------------- | ------------------------------------------- | ---------- |
| `claude-opus`   | `claude-opus-4-6`                           | Anthropic  |
| `claude-sonnet` | `claude-sonnet-4-6`                         | Anthropic  |
| `gemini-pro`    | `gemini-2.5-pro-preview-06-05`              | Google     |
| `gemini-flash`  | `gemini-2.5-flash-preview-05-20`            | Google     |
| `nano-banana-2` | `gemini-2.0-flash-preview-image-generation` | Google     |
| `google-search` | `google-custom-search`                      | Serper     |

### 6.2 Gemini-klient

**Fil:** `src/llm/gemini.ts`

- Singleton `GoogleGenAI`-instans (cachas vid första anrop)
- `callGemini(config, modelId, request)` → `LLMResponse`
- Skickar `systemPrompt` och `userPrompt` som contents-array
- Stöder `temperature` och `maxOutputTokens`
- Returnerar tokensIn/tokensOut/durationMs
- **Context caching är INTE implementerat** – enbart direktanrop

### 6.3 Claude-klient

**Fil:** `src/llm/claude.ts`

- Singleton `Anthropic`-instans
- `callClaude(config, modelId, request)` → `LLMResponse`
- Använder `client.messages.create()` med system, messages, max_tokens, temperature
- Filtrerar textblock från svaret

### 6.4 Bildgenerering (Nano Banana 2)

**Fil:** `src/llm/nano-banana.ts`

- `generateImage(config, request)` → `ImageGenerationResponse`
- Använder Gemini API med `responseModalities: ["IMAGE", "TEXT"]`
- Modell: `gemini-2.0-flash-preview-image-generation`
- Returnerar base64-kodad `Buffer` + mimeType
- Kastar fel om inget bildsvar returneras

### 6.5 Google Search

**Fil:** `src/llm/google-search.ts`

- `searchGoogle(config, query)` → `SearchResult[]`
- Använder Serper API (`https://google.serper.dev/search`)
- Hårdkodade parametrar: locale `SE`, språk `sv`, max 10 resultat
- Returnerar `{ title, snippet, url }` per resultat

---

## 7. Multi-modell-router

**Fil:** `src/gateway/router.ts`

### resolveRoute(routing, taskType) → RouteResult

Slår upp `taskType` i agentens routing-manifest. Om ingen match → fallback till `routing.default`. Returnerar `{ alias, modelId, provider }`.

### routeRequest(config, logger, routing, taskType, request) → LLMResponse

Dispatcher:

| Provider        | Dispatch till                                    |
| --------------- | ------------------------------------------------ |
| `claude`        | `callClaude()`                                   |
| `gemini`        | `callGemini()`                                   |
| `google-search` | `searchGoogle()` → formaterade resultat som text |
| `nano-banana`   | Kastar fel (enbart via `routeImageRequest`)      |

Google Search-resultat wrappas som `LLMResponse` med tokensIn/Out = 0.

### routeImageRequest(config, logger, request) → ImageGenerationResponse

Alltid → `generateImage()` (Nano Banana 2).

---

## 8. Agentramverk

### 8.1 Manifest-laddare

**Fil:** `src/agents/agent-loader.ts`

`loadAgentManifest(knowledgeDir, slug)` → `AgentManifest`:

- Läser `knowledge/agents/{slug}/agent.yaml`
- Parsar YAML med `yaml`-biblioteket
- Sätter defaults: `system_context=[]`, `task_context={}`, `tools=[]`, `writable=[]`, `escalation_threshold=3`, `sample_review_rate=0`

`resolveAgentFiles(knowledgeDir, slug, relativePaths)` → `string`:

- Läser en lista filer relativt agentmappen
- Kombinerar med `\n\n---\n\n` som separator
- Returnerar tom sträng för filer som inte existerar

### 8.2 AgentManifest-interface

```typescript
interface AgentManifest {
  name: string;
  slug: string;
  version: string;
  routing: Record<string, string>; // taskType → ModelAlias
  system_context: string[]; // Alltid-laddade filer
  task_context: Record<string, string[]>; // taskType → filer
  tools: string[]; // MCP-verktyg (ej använda i kod)
  autonomy: "autonomous" | "semi-autonomous" | "manual";
  escalation_threshold: number; // Max avslag före eskalering
  sample_review_rate: number; // Stickprovsfrekvens
  writable: string[]; // Filer agenten får skriva till
  has_veto?: boolean; // Brand Agent-specifikt
  budget_limit_sek?: number; // Campaign Agent-specifikt
  score_threshold_mql?: number; // Lead Agent-specifikt
}
```

### 8.3 BaseAgent (abstrakt)

**Fil:** `src/agents/base-agent.ts`

**Konstruktor:** `(config, logger, supabase, manifest)`

**Metoder:**

| Metod                             | Beskrivning                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `execute(task)`                   | Skapar task i Supabase (queued → in_progress → awaiting_review). Anropar LLM. Vid fel: status → queued. |
| `getSystemPrompt()`               | Laddar varumärkeskontext + agentens system_context → bygger systemprompt                                |
| `getTaskContext(taskType)`        | Laddar task_context-filer för given uppgiftstyp                                                         |
| `callLLM(taskType, userPrompt)`   | Bygger fullständig prompt, routar till rätt LLM                                                         |
| `getAgentId()`                    | Hämtar agent-UUID från Supabase via slug                                                                |
| `writeMemory(relativePath, data)` | Skriver JSON till fil, kontrollerar `writable`-lista                                                    |

**Task-livscykel i execute():**

1. Skapar task i Supabase (status: `queued`)
2. Uppdaterar till `in_progress`
3. Loggar `task_started` i activity_log
4. Anropar LLM via `callLLM()`
5. Uppdaterar till `awaiting_review` med content_json, model_used, tokens_used
6. Vid fel: återställer till `queued`

**Returtyp:** `AgentResult { taskId, output, model, tokensIn, tokensOut, durationMs, status }`

### 8.4 Agent-fabrik

**Fil:** `src/agents/agent-factory.ts`

`createAgent(slug, config, logger, supabase)` → `BaseAgent`:

- Laddar manifest dynamiskt via `loadAgentManifest()`
- Instansierar rätt agent-klass baserat på slug
- Stödda slugs: `content`, `brand`, `strategy`, `campaign`, `seo`, `lead`, `analytics`
- Kastar fel vid okänt slug

`getAllAgentSlugs()` → `string[]`:

- Returnerar `["strategy", "content", "campaign", "seo", "lead", "analytics", "brand"]`

---

## 9. Agentimplementationer

### 9.1 Content Agent

**Fil:** `src/agents/content/content-agent.ts`

**Routing (från agent.yaml):**

- `default` → `gemini-pro`
- `metadata`, `alt_text`, `ab_variants` → `gemini-flash`
- `images` → `nano-banana-2`

**Speciallogik:**

- **Bildgenerering:** Om `task.type === "images"` → anropar `routeImageRequest()` direkt, sparar base64 i content_json, sätter status `approved`
- **Textinnehåll:** Kör `executeWithReview()` – genomför Brand Agent-granskning i loop:
  1. Genererar innehåll via `super.execute()`
  2. Brand Agent granskar
  3. Om godkänt → returnera
  4. Om underkänt → regenerera med feedback i prompten
  5. Max `escalation_threshold` försök (default 3)
  6. Vid max försök → status `escalated`
- Ackumulerar tokens/duration över revisioner

### 9.2 Brand Agent

**Fil:** `src/agents/brand/brand-agent.ts`

**Routing:** Enbart `gemini-pro` (alltid)

**Speciallogik:**

`review(request: ReviewRequest)` → `ReviewResult`:

1. Bygger granskningsprompt med varumärkesregler
2. Anropar LLM, parsar JSON-svar (`{ decision, feedback }`)
3. Vid underkännande:
   - Räknar avslag per task (in-memory `Map<string, number>`)
   - Skriver avslagsmönster till `memory/rejection-patterns.json` (max 100 poster)
   - Om `≥ escalation_threshold` avslag → eskalerar till Orchestrator via Slack
4. Skapar approval-post i Supabase
5. Uppdaterar task-status (`approved` / `rejected`)
6. Loggar till activity_log

**Escalation:**

- Uppdaterar task till `awaiting_review`
- Skapar approval med eskaleringsfeedback
- Skickar Slack-meddelande via `sendEscalation()` till #fia-orchestrator

### 9.3 Strategy Agent

**Fil:** `src/agents/strategy/strategy-agent.ts`

**Routing:** `default` → `gemini-pro`, `research`/`trend_analysis` → `google-search`

**Speciallogik:**

- Researchuppgifter (type: `research`, `trend_analysis`) kör tvåstegsprocess:
  1. Google Search → sökresultat
  2. Gemini Pro → analysera och sammanfatta
- Sparar `search_results` + `analysis` i content_json
- Övriga uppgifter → standard `BaseAgent.execute()`

### 9.4 Campaign Agent

**Fil:** `src/agents/campaign/campaign-agent.ts`

**Routing:** `default` → `gemini-pro`, `ab_variants`/`segmentation` → `gemini-flash`

**Speciallogik:**

- A/B-varianter: appendar instruktioner att generera exakt 2 varianter (A, B) med hypotes
- Sparar A/B-resultat till `memory/ab-test-results.json` (max 50 poster)

### 9.5 SEO Agent

**Fil:** `src/agents/seo/seo-agent.ts`

**Routing:** `default` → `google-search`, `bulk_optimization` → `gemini-flash`, `content_recommendations` → `gemini-pro`

**Speciallogik:**

- Sparar keyword-rankings till `memory/keyword-rankings.json` efter `keyword_research`-uppgifter (max 50 poster)

### 9.6 Lead Agent

**Fil:** `src/agents/lead/lead-agent.ts`

**Routing:** `default` → `gemini-flash`, `nurture_sequences` → `gemini-pro`

**Speciallogik:**

- Nurture-sekvenser → genomgår Brand Agent-granskning (samma mönster som Content Agent)
- Lead scoring → appendar MQL-tröskel (`score_threshold_mql`) till prompten

### 9.7 Analytics Agent

**Fil:** `src/agents/analytics/analytics-agent.ts`

**Routing:** `default` → `gemini-flash`, `insights`/`report_writing` → `gemini-pro`

**Speciallogik:**

- Mappar uppgiftstyper till routing: `morning_pulse` → `insights`, `weekly_report`/`quarterly_review` → `report_writing`
- Försöker extrahera metrics från LLM-svar (JSON-block i markdown)
- Skriver extraherade metrics till Supabase metrics-tabell
- Auto-detekterar period: daily/weekly/monthly baserat på uppgiftstyp

---

## 10. Supabase-integration

### 10.1 Klient

**Fil:** `src/supabase/client.ts`

- `createSupabaseClient(config)` → `SupabaseClient`
- Använder service role key (full åtkomst, kringgår RLS)
- Session persistence avaktiverat (daemon-läge)

### 10.2 Heartbeat

**Fil:** `src/supabase/heartbeat.ts`

- `startHeartbeat(supabase, logger, intervalMs?)` → `NodeJS.Timeout`
- Uppdaterar `last_heartbeat` på alla agenter med status `active` eller `idle`
- Default: var 60:e sekund
- Skickar första heartbeat omedelbart

### 10.3 Task-skrivare

**Fil:** `src/supabase/task-writer.ts`

| Funktion                                             | Beskrivning                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `createTask(supabase, input)`                        | INSERT i tasks, returnerar task-id                                          |
| `updateTaskStatus(supabase, taskId, status, extra?)` | UPDATE status, sätter `completed_at` automatiskt vid `published`/`approved` |
| `createApproval(supabase, input)`                    | INSERT i approvals, returnerar approval-id                                  |

### 10.4 Metrics-skrivare

**Fil:** `src/supabase/metrics-writer.ts`

- `writeMetric(supabase, input)` → void
- INSERT i metrics med category, metric_name, value, period, period_start

### 10.5 Aktivitetslogg

**Fil:** `src/supabase/activity-writer.ts`

- `logActivity(supabase, input)` → void
- INSERT i activity_log med valfri agent_id, user_id, action, details_json

### 10.6 Kommandolyssnare

**Fil:** `src/supabase/command-listener.ts`

Prenumererar på Supabase Realtime (INSERT på `commands`-tabellen).

**Hanterade kommandon:**

| Kommandotyp              | Åtgärd                                        |
| ------------------------ | --------------------------------------------- |
| `kill_switch_activate`   | Aktiverar kill switch                         |
| `kill_switch_deactivate` | Avaktiverar kill switch                       |
| `pause_agent`            | Sätter agent status → `paused`                |
| `resume_agent`           | Sätter agent status → `active`                |
| `approve_task`           | Uppdaterar task → `approved`, skapar approval |
| `reject_task`            | Uppdaterar task → `rejected`, skapar approval |

Alla kommandon loggas till activity_log.

---

## 11. Slack-integration

### 11.1 App

**Fil:** `src/slack/app.ts`

- Socket Mode (utgående websocket, ingen inkommande HTTP)
- Singleton-mönster (`getSlackApp()` returnerar instans eller null)
- Registrerar kommandon och meddelandehanterare vid start

### 11.2 Kanaler

**Fil:** `src/slack/channels.ts`

| Konstant       | Kanal               |
| -------------- | ------------------- |
| `orchestrator` | `#fia-orchestrator` |
| `content`      | `#fia-content`      |
| `campaigns`    | `#fia-campaigns`    |
| `analytics`    | `#fia-analytics`    |
| `logs`         | `#fia-logs`         |

### 11.3 Slash-kommandon

**Fil:** `src/slack/commands.ts`

Alla via `/fia <subcommand>`:

| Subcommand                              | Behörighet | Funktion                                                              |
| --------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `status`                                | Alla       | Visar gateway-status, kill switch-state, agentlista med status-ikoner |
| `kill`                                  | Alla       | Aktiverar kill switch, pausar publiceringsagenter                     |
| `resume`                                | Alla       | Avaktiverar kill switch, återupptar agenter                           |
| `approve <task-id> [feedback]`          | Alla       | Godkänner task, skapar approval-post                                  |
| `reject <task-id> <feedback>`           | Alla       | Avslår task (feedback obligatoriskt)                                  |
| `run <agent> [task-type] [description]` | Alla       | Triggar agent manuellt (async, blockerar ej svar)                     |

`/fia` utan argument eller okänt subcommand → visar hjälptext.

**Notering:** Slack-kommandon gör ingen rollkontroll – alla Slack-användare kan utföra alla kommandon. Rollbaserad åtkomst finns enbart i REST API:t.

### 11.4 Eskaleringar

**Fil:** `src/slack/handlers.ts`

- `sendEscalation(app, logger, agentSlug, taskId, reason)` – postar eskaleringsmeddelande till `#fia-orchestrator`
- Meddelandehanterare registrerad men minimal implementering (filtrerar bort bot-meddelanden, loggar)

---

## 12. REST API

### 12.1 Server

**Fil:** `src/api/server.ts`

- Express-app med JSON-body parsing
- Kräver Supabase för att starta
- Global felhanterare returnerar `{ error: { code: "INTERNAL", message } }`

### 12.2 Autentisering

**Fil:** `src/api/middleware/auth.ts`

`requireAuth(supabase)` middleware:

1. Extraherar JWT från `Authorization: Bearer <token>` header
2. Validerar token via `supabase.auth.getUser(token)`
3. Hämtar roll från `profiles`-tabellen
4. Sätter `req.user = { id, role }` (default roll: `viewer`)

`requireRole(...roles)` middleware:

- Returnerar 403 om `req.user.role` inte ingår i tillåtna roller
- Felmeddelande på svenska: `"Rollen '{role}' har inte behörighet för denna åtgärd."`

### 12.3 Endpoints

#### Hälsokontroll (ingen auth)

| Metod | Sökväg        | Svar                          |
| ----- | ------------- | ----------------------------- |
| GET   | `/api/health` | `{ status: "ok", timestamp }` |

#### Agenter

**Fil:** `src/api/routes/agents.ts`

| Metod | Sökväg                     | Behörighet          | Funktion                                                                |
| ----- | -------------------------- | ------------------- | ----------------------------------------------------------------------- |
| GET   | `/api/agents`              | Alla autentiserade  | Lista agenter med task-counts för idag (queued, in_progress, completed) |
| POST  | `/api/agents/:slug/pause`  | orchestrator, admin | Sätter agent status → `paused`                                          |
| POST  | `/api/agents/:slug/resume` | orchestrator, admin | Sätter agent status → `active`                                          |

**GET /api/agents svar:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Content Agent",
      "slug": "content",
      "status": "active",
      "autonomy_level": "autonomous",
      "last_heartbeat": "2026-03-12T08:42:00Z",
      "tasks_today": { "queued": 2, "in_progress": 1, "completed": 5 }
    }
  ]
}
```

#### Uppgifter

**Fil:** `src/api/routes/tasks.ts`

| Metod | Sökväg                    | Behörighet          | Funktion                                |
| ----- | ------------------------- | ------------------- | --------------------------------------- |
| GET   | `/api/tasks`              | Alla autentiserade  | Lista tasks (paginerat, filtrerbart)    |
| GET   | `/api/tasks/:id`          | Alla autentiserade  | Hämta task med tillhörande approvals    |
| POST  | `/api/tasks/:id/approve`  | orchestrator, admin | Godkänn task                            |
| POST  | `/api/tasks/:id/reject`   | orchestrator, admin | Avslå task (feedback obligatoriskt)     |
| POST  | `/api/tasks/:id/revision` | orchestrator, admin | Begär revision (feedback obligatoriskt) |

**GET /api/tasks query-parametrar:**

- `status` – filtrera på status
- `agent_slug` – filtrera på agent
- `type` – filtrera på uppgiftstyp
- `priority` – filtrera på prioritet
- `page` (default: 1)
- `per_page` (default: 50, max: 100)
- `sort` (default: `-created_at`, prefix `-` = descending)

**Svar:** `{ data: [...], meta: { total, page, per_page } }`

#### Metrics

**Fil:** `src/api/routes/metrics.ts`

| Metod | Sökväg                 | Behörighet         | Funktion                             |
| ----- | ---------------------- | ------------------ | ------------------------------------ |
| GET   | `/api/metrics`         | Alla autentiserade | Lista metrics (filtrerbart, max 200) |
| GET   | `/api/metrics/summary` | Alla autentiserade | Förberäknad KPI-sammanfattning       |

**GET /api/metrics query-parametrar:** `category`, `period`, `from`, `to`

**GET /api/metrics/summary svar:**

```json
{
  "data": {
    "content_this_week": 14,
    "approval_rate": 0.87,
    "pending_approvals": 3,
    "cost_mtd_sek": 4230.5
  }
}
```

Summary beräknar:

- `content_this_week`: blog_posts med status approved/published denna vecka
- `approval_rate`: godkännandeandel senaste 30 dagarna
- `pending_approvals`: tasks med status `awaiting_review`
- `cost_mtd_sek`: summerad cost_sek för innevarande månad

#### Aktivitetslogg

**Fil:** `src/api/routes/activity.ts`

| Metod | Sökväg          | Behörighet         | Funktion                                   |
| ----- | --------------- | ------------------ | ------------------------------------------ |
| GET   | `/api/activity` | Alla autentiserade | Lista aktiviteter (paginerat, filtrerbart) |

**Query-parametrar:** `agent_slug`, `action`, `from`, `to`, `search`, `page`, `per_page`

#### Kill Switch

**Fil:** `src/api/routes/kill-switch.ts`

| Metod | Sökväg                    | Behörighet          | Funktion                                                       |
| ----- | ------------------------- | ------------------- | -------------------------------------------------------------- |
| GET   | `/api/kill-switch/status` | Alla autentiserade  | Hämta kill switch-status                                       |
| POST  | `/api/kill-switch`        | orchestrator, admin | Aktivera/avaktivera (`{ action: "activate" \| "deactivate" }`) |

### 12.4 Felformat

Alla felmeddelanden följer formatet:

```json
{
  "error": {
    "code": "UNAUTHORIZED|FORBIDDEN|NOT_FOUND|VALIDATION|INTERNAL",
    "message": "Beskrivning"
  }
}
```

HTTP-statuskoder: 200, 400, 401, 403, 404, 500.

---

## 13. Schemaläggning

**Fil:** `src/gateway/scheduler.ts`

7 cron-jobb:

| Cron                   | Tid                          | Agent     | Uppgift             | Beskrivning         |
| ---------------------- | ---------------------------- | --------- | ------------------- | ------------------- |
| `0 7 * * 1-5`          | 07:00 mån–fre                | analytics | `morning_pulse`     | Morgonpuls          |
| `0 8 * * 1`            | 08:00 måndag                 | strategy  | `weekly_planning`   | Veckoplanering      |
| `0 9 * * 1,3,5`        | 09:00 mån/ons/fre            | content   | `scheduled_content` | Schemalagt innehåll |
| `0 10 * * *`           | 10:00 dagligen               | lead      | `lead_scoring`      | Lead scoring        |
| `0 14 * * 5`           | 14:00 fredag                 | analytics | `weekly_report`     | Veckorapport        |
| `0 9 1-7 * 1`          | 09:00 1:a måndagen/mån       | strategy  | `monthly_planning`  | Månadsplanering     |
| `0 9 25-31 3,6,9,12 5` | 09:00 sista fredagen/kvartal | analytics | `quarterly_review`  | Kvartalsöversikt    |

**Beteende:**

- Kontrollerar kill switch före exekvering (hoppar över om aktiv)
- Kontrollerar agentstatus i Supabase (hoppar över om pausad)
- Loggar till activity_log
- Instansierar agent via `createAgent()` och anropar `execute()`
- Fångar och loggar fel utan att krascha processen

---

## 14. Kill Switch

**Fil:** `src/utils/kill-switch.ts`

In-memory state (`KillSwitchState`):

```typescript
{ active: boolean, activatedAt: string | null, activatedBy: string | null, source: string | null }
```

**activate(source, userId?):**

- Sätter state till aktiv
- Pausar agenter: `content`, `campaign`, `seo`, `lead` (INTE strategy, analytics, brand)
- Loggar till activity_log

**deactivate(source, userId?):**

- Nollställer state
- Återupptar alla pausade agenter (`status: "paused"` → `"active"`)
- Loggar till activity_log

**Dual-aktivering:**

- Slack: via `/fia kill` och `/fia resume`
- Dashboard: via Supabase Realtime (commands-tabellen)
- REST API: via `POST /api/kill-switch`

---

## 15. Kunskapsbas

### 15.1 Varumärkeskontext (delad)

**Sökväg:** `knowledge/brand/`

| Fil           | Innehåll                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| `platform.md` | Forefront varumärkesplattform – vision, löfte, övertygelser, karaktärsdrag |
| `tonality.md` | 6 tonalitetsregler + undvik-lista + efterlikna-exempel                     |
| `visual.md`   | Färgpalett (organiska + gradient), typsnitt (Manrope), logotyp, bildspråk  |
| `messages.md` | Budskapshierarki nivå 1–3 (hero, artiklar, sociala medier)                 |

Laddas av `loadBrandContext()` och ingår i alla agenters systemprompt.

### 15.2 Agentmanifest och kontext

**Sökväg:** `knowledge/agents/{slug}/`

Varje agent har:

- `agent.yaml` – Manifest (routing, context, tools, autonomi, guardrails)
- `SKILL.md` – Roll, mål, guardrails
- `context/` – Templates, few-shot-exempel, riktlinjer
- `memory/` – Skrivbara filer för ackumulerade lärdomar (JSON)

**Befintliga kontextfiler per agent:**

| Agent     | Templates                                                                   | Few-shot                                                     | Övrig kontext         |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------- |
| Strategy  | quarterly-plan.md, monthly-plan.md, campaign-brief.md                       | –                                                            | planning-framework.md |
| Content   | blog-post.md, newsletter.md, case-study.md, whitepaper.md, linkedin-post.md | blog-good.md, blog-bad.md, linkedin-good.md, linkedin-bad.md | tone-examples.md      |
| Campaign  | email-sequence.md, ad-copy.md, landing-page.md                              | campaign-good.md                                             | –                     |
| SEO       | seo-audit.md                                                                | –                                                            | geo-guidelines.md     |
| Lead      | nurture-email.md, scoring-rules.md                                          | –                                                            | –                     |
| Analytics | morning-pulse.md, weekly-report.md, quarterly-review.md                     | –                                                            | –                     |
| Brand     | –                                                                           | review-approved.md, review-rejected.md                       | review-checklist.md   |

### 15.3 Agentmanifest – sammanfattning

| Agent     | Autonomi        | Default-modell | Eskaleringsmax | Stickprov | Veto   | Specialfält               |
| --------- | --------------- | -------------- | -------------- | --------- | ------ | ------------------------- |
| Strategy  | semi-autonomous | gemini-pro     | 1              | 100%      | –      | –                         |
| Content   | autonomous      | gemini-pro     | 3              | 20%       | –      | –                         |
| Campaign  | autonomous      | gemini-pro     | 3              | 33%       | –      | `budget_limit_sek: 10000` |
| SEO       | autonomous      | google-search  | 3              | 0%        | –      | –                         |
| Lead      | autonomous      | gemini-flash   | 3              | 0%        | –      | `score_threshold_mql: 75` |
| Analytics | autonomous      | gemini-flash   | 3              | 0%        | –      | –                         |
| Brand     | autonomous      | gemini-pro     | 3              | 0%        | **Ja** | `has_veto: true`          |

---

## 16. Databasschema

**Fil:** `supabase/migrations/001_initial_schema.sql`

### 16.1 Tabeller

#### profiles

```
id          uuid PK → auth.users(id)
name        text NOT NULL
role        text NOT NULL DEFAULT 'viewer' CHECK (orchestrator|admin|viewer)
avatar_url  text
created_at  timestamptz DEFAULT now()
```

Trigger: `on_auth_user_created` → auto-skapar profil vid ny användare (roll: viewer).

#### agents

```
id              uuid PK
name            text NOT NULL
slug            text UNIQUE CHECK (^[a-z][a-z0-9_-]*$)
status          text DEFAULT 'idle' CHECK (active|paused|error|idle)
autonomy_level  text CHECK (autonomous|semi-autonomous|manual)
last_heartbeat  timestamptz
config_json     jsonb DEFAULT '{}'
created_at      timestamptz DEFAULT now()
```

Index: slug, status.

#### tasks

```
id            uuid PK
agent_id      uuid FK → agents(id) CASCADE
type          text CHECK (19 typer: blog_post, social_media, ...)
title         text NOT NULL
status        text DEFAULT 'queued' CHECK (7 statusar)
priority      text DEFAULT 'normal' CHECK (low|normal|high|urgent)
content_json  jsonb DEFAULT '{}'
model_used    text
tokens_used   integer
cost_sek      numeric(10,4)
created_at    timestamptz DEFAULT now()
completed_at  timestamptz
```

Index: agent_id, status, type, created_at (DESC), priority.

**Tillåtna typer:** blog_post, social_media, newsletter, campaign, report, review, case_study, whitepaper, email_sequence, ad_copy, landing_page, seo_audit, lead_scoring, nurture_email, morning_pulse, weekly_report, quarterly_review, image, other.

**Tillåtna statusar:** queued, in_progress, awaiting_review, approved, rejected, revision_requested, published.

#### approvals

```
id             uuid PK
task_id        uuid FK → tasks(id) CASCADE
reviewer_type  text CHECK (brand_agent|orchestrator|admin|ledningsgrupp)
reviewer_id    uuid FK → profiles(id) nullable
decision       text CHECK (approved|rejected|revision_requested)
feedback       text
created_at     timestamptz DEFAULT now()
```

Index: task_id, decision.

#### metrics

```
id             uuid PK
category       text CHECK (content|traffic|leads|cost|brand)
metric_name    text NOT NULL
value          numeric NOT NULL
period         text CHECK (daily|weekly|monthly)
period_start   date NOT NULL
metadata_json  jsonb DEFAULT '{}'
created_at     timestamptz DEFAULT now()
```

Index: category, (period + period_start), metric_name.

#### activity_log

```
id            uuid PK
agent_id      uuid FK → agents(id) SET NULL nullable
user_id       uuid FK → profiles(id) SET NULL nullable
action        text NOT NULL
details_json  jsonb DEFAULT '{}'
created_at    timestamptz DEFAULT now()
```

Index: agent_id, user_id, action, created_at (DESC).

### 16.2 Row Level Security (RLS)

- **Alla tabeller:** RLS aktiverat
- **SELECT:** Alla autentiserade användare kan läsa alla tabeller
- **UPDATE/INSERT:** Enbart `orchestrator` och `admin` (via `get_user_role()` helper-funktion)
- **profiles:** Användare kan uppdatera sin egen profil
- Gateway använder service role key → kringgår RLS

### 16.3 Realtime

Följande tabeller exponeras via Supabase Realtime:

- `agents`
- `tasks`
- `approvals`
- `activity_log`

### 16.4 Seed-data

**Fil:** `supabase/seed.sql`

7 agenter med initial status `idle`:

| name            | slug      | autonomy_level  |
| --------------- | --------- | --------------- |
| Strategy Agent  | strategy  | semi-autonomous |
| Content Agent   | content   | autonomous      |
| Campaign Agent  | campaign  | autonomous      |
| SEO Agent       | seo       | autonomous      |
| Lead Agent      | lead      | autonomous      |
| Analytics Agent | analytics | autonomous      |
| Brand Agent     | brand     | autonomous      |

---

## 17. Felhantering

**Fil:** `src/utils/errors.ts`

| Felklass          | Syfte                                                     |
| ----------------- | --------------------------------------------------------- |
| `FIAError`        | Basklass (extends Error), med valfri `code` och `details` |
| `LLMError`        | LLM-specifika fel (modellfel, timeout)                    |
| `AgentError`      | Agentexekveringsfel                                       |
| `EscalationError` | Eskaleringshändelser                                      |

---

## 18. PM2-konfiguration

**Fil:** `ecosystem.config.js`

```javascript
{
  name: "fia-gateway",
  script: "dist/index.js",
  instances: 1,
  autorestart: true,
  max_memory_restart: "512M",
  env: { NODE_ENV: "production" }
}
```

---

## 19. Dataflöden

### 19.1 Agentexekvering (Content Agent, typiskt flöde)

```
Trigger (cron/Slack)
  → agent-factory skapar ContentAgent
  → agent-loader läser agent.yaml
  → BaseAgent.execute():
      → createTask() i Supabase (status: queued)
      → updateTaskStatus(in_progress)
      → getSystemPrompt() = brandContext + SKILL.md + tone-examples.md
      → getTaskContext(blog_post) = blog-post.md + blog-good.md + blog-bad.md
      → callLLM() → router → gemini-pro
      → updateTaskStatus(awaiting_review) med content_json
  → ContentAgent.executeWithReview():
      → BrandAgent.review() → gemini-pro granskar
      → Om approved → return
      → Om rejected → regenerera med feedback, upprepa (max 3)
      → Om 3x rejected → escalate till Slack
```

### 19.2 Dashboard-kommando

```
Dashboard (frontend)
  → Supabase Edge Function
  → INSERT i commands-tabellen
  → Supabase Realtime → command-listener.ts
  → Utför åtgärd (pause/resume/approve/reject/kill switch)
  → Loggar till activity_log
  → Supabase Realtime → Dashboard uppdateras live
```

---

## 20. Saknade implementationer

Följande refereras i CLAUDE.md eller agent.yaml men existerar **inte** i kodbasen:

| Område                                       | Status                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| MCP-klient (`src/mcp/mcp-client.ts`)         | Saknas helt                                                                    |
| HubSpot MCP-wrapper (`src/mcp/hubspot.ts`)   | Saknas helt                                                                    |
| LinkedIn MCP-wrapper (`src/mcp/linkedin.ts`) | Saknas helt                                                                    |
| Buffer MCP-wrapper (`src/mcp/buffer.ts`)     | Saknas helt                                                                    |
| gws CLI-integration                          | Konfigureras i agent.yaml (tools) men ingen kod använder det                   |
| Gemini context caching                       | Ej implementerat (enbart direktanrop)                                          |
| Perplexity Sonar API                         | Ersatt av Serper Google Search                                                 |
| Tester                                       | Inga testfiler existerar (Jest konfigurerat med `--passWithNoTests`)           |
| `commands`-tabell i Supabase                 | Refereras av command-listener men saknar migration (förväntas skapas manuellt) |

---

## 21. Filöversikt (41 TypeScript-filer)

```
src/
├── index.ts                          # Entrypoint – startar allt
├── gateway/
│   ├── logger.ts                     # Strukturerad JSON-loggning
│   ├── router.ts                     # Multi-modell-routing
│   └── scheduler.ts                  # 7 cron-jobb
├── llm/
│   ├── types.ts                      # Modelltyper och interface
│   ├── gemini.ts                     # Gemini 2.5 Pro/Flash
│   ├── claude.ts                     # Claude Opus/Sonnet
│   ├── nano-banana.ts                # Bildgenerering
│   └── google-search.ts             # Serper-baserad sökning
├── agents/
│   ├── agent-loader.ts               # YAML-manifest-parsning
│   ├── agent-factory.ts              # Slug → agent-instans
│   ├── base-agent.ts                 # Abstrakt basklass
│   ├── content/content-agent.ts      # Innehållsproduktion + Brand review
│   ├── brand/brand-agent.ts          # Varumärkesgranskning + veto
│   ├── strategy/strategy-agent.ts    # Planering + research
│   ├── campaign/campaign-agent.ts    # Kampanjer + A/B-test
│   ├── seo/seo-agent.ts             # SEO + keyword-tracking
│   ├── lead/lead-agent.ts           # Lead scoring + nurture
│   └── analytics/analytics-agent.ts  # Rapporter + metrics-extraktion
├── slack/
│   ├── app.ts                        # Slack Bolt (Socket Mode)
│   ├── commands.ts                   # /fia slash-kommandon
│   ├── handlers.ts                   # Meddelandehantering + eskalering
│   └── channels.ts                   # Kanalmappning
├── supabase/
│   ├── client.ts                     # Supabase-klient
│   ├── heartbeat.ts                  # Agent-heartbeats var 60s
│   ├── task-writer.ts                # CRUD för tasks + approvals
│   ├── metrics-writer.ts             # Skriver KPI-data
│   ├── activity-writer.ts            # Audit trail
│   └── command-listener.ts           # Realtime-kommandon från Dashboard
├── api/
│   ├── server.ts                     # Express-server
│   ├── middleware/auth.ts            # JWT-validering + rollkontroll
│   └── routes/
│       ├── agents.ts                 # Agent-endpoints
│       ├── tasks.ts                  # Task-endpoints
│       ├── metrics.ts                # Metrics-endpoints
│       ├── activity.ts               # Aktivitetslogg-endpoint
│       └── kill-switch.ts            # Kill switch-endpoints
├── context/
│   ├── context-manager.ts            # Läser och cachar kunskapsbas
│   └── prompt-builder.ts             # Bygger system- och task-prompter
└── utils/
    ├── config.ts                     # Miljövariabelladdning
    ├── errors.ts                     # Feltyper
    └── kill-switch.ts                # Nödbroms
```
