# FIA – Arkitektur & Teknisk Blueprint

All arkitektur, agentdefinitioner, datamodell, API-kontrakt, roadmap och principer. Gateway- och Dashboard-repon pekar hit.

**Version:** 0.5.3
**Senast uppdaterad:** 2026-03-24

---

## Nuläge (2026-03-24)

### Övergripande status

| Delsystem            | Status                                                             | Deploy             |
| -------------------- | ------------------------------------------------------------------ | ------------------ |
| Gateway (backend)    | Solid MVP, 8 agenter, trigger engine, dynamisk scheduler, CI/CD    | 0.5.3 (2026-03-24) |
| CLI                  | 16 kommandon, cron CRUD, triggers, lineage                         | 0.5.3 (2026-03-24) |
| Dashboard (frontend) | Robust MVP, cron-hantering, trigger-kö, task-relationer, i18n, PWA | Live på Lovable    |
| Supabase (DB)        | 11 tabeller, RLS, Realtime, pending_triggers, scheduled_jobs       | EU-region aktiv    |
| GCP (hosting)        | Compute Engine konfigurerad                                        | europe-north1-b    |
| Slack                | cron CRUD, triggers, lineage, notify_slack, auto-notiser           | 0.5.3 (2026-03-24) |
| MCP-integrationer    | gws kopplad till agenter (Drive, Docs, Sheets)                     | Live               |

### Backend – Gateway (Ambivrt/FIA)

**Kodbas:** ~85 TypeScript-filer, ~9 500 LOC, TypeScript strict mode, 22 testfiler (304 tester), CI/CD via GitHub Actions, ESLint + Prettier.

**Nytt i 0.5.3:**

| Komponent                                                                  | Status |
| -------------------------------------------------------------------------- | ------ |
| Delad cron-service (`src/shared/cron-service.ts`) – CRUD med validering    | Klart  |
| `fia cron` CLI-kommando – list, create, edit, delete, enable, disable      | Klart  |
| `/fia cron` Slack-kommandon – samma CRUD via Slack                         | Klart  |
| CLI Supabase-klient (`cli/lib/supabase.ts`) – direkt DB-åtkomst            | Klart  |
| Triple-interface komplett: Dashboard + CLI + Slack har likvärdig cron-CRUD | Klart  |
| `update_schedule`-command → scheduler.reload() vid alla mutationer         | Klart  |
| CLI-version bumpad till 0.5.3 (15 → 16 kommandon)                          | Klart  |

**Klart sedan tidigare (0.5.1–0.5.2):**

- Trigger engine med config_json, reseed, 7 triggers i 4 agenter
- CLI: triggers, lineage, config/reseed (15 kommandon)
- Slack: triggers, lineage, auto-notiser
- Dashboard: trigger-konfiguration, trigger-kö, task-relationer
- 17-statusmodell med statusmaskin

**Kvarstår:**

| Komponent                                              | Status      |
| ------------------------------------------------------ | ----------- |
| MCP-wrappers (HubSpot, LinkedIn, Buffer)               | Ej påbörjat |
| Content staging (Zod-validering av content_json)       | Fas 2       |
| Feedback-loop (feedback-summary, dynamisk review rate) | Fas 3       |

### Frontend – Dashboard PWA (Ambivrt/fia-frontend)

**Kodbas:** React 18.3 + Vite 5.4 + TypeScript 5.8 (strict: true), Tailwind 3.4 + shadcn/ui, TanStack React Query 5.83, 15 sidor, 30+ komponenter, 80+ API-funktioner.

**Senaste (0.5.2–0.5.3):**

| Komponent                                                       | Status |
| --------------------------------------------------------------- | ------ |
| SchedulerSection – komplett CRUD för schemalagda jobb           | Klart  |
| Visuell cron-editor (daglig/veckovis/månatlig + avancerat läge) | Klart  |
| Realtidssynk med `update_schedule`-command                      | Klart  |
| Trigger-konfiguration: AgentTriggersTab, TriggerCard, reseed    | Klart  |
| TriggersConfigPage med systemövergripande trigger-översikt      | Klart  |
| TaskStatusBadge (17 statusar), task-relationer                  | Klart  |
| i18n-nycklar (sv + en, 40+ nycklar)                             | Klart  |

**Kvarstår:**

| Komponent                 | Status |
| ------------------------- | ------ |
| Content staging / preview | Fas 2  |
| Feedback-UI / rating      | Fas 3  |

---

## Arkitekturöversikt

```
┌─────────────────────────────────────────────────────┐
│                  FIA Gateway                         │
│  (Node.js daemon – persistent, always-on)            │
│                                                      │
│  Scheduler ─── Router ─── Slack Interface            │
│       │          │              │                    │
│       ▼          ▼              ▼                    │
│  Task Queue   LLM-klienter   Bolt SDK               │
│  (prioritet,  ┌──────────┐   (Socket Mode)          │
│   max 3       │Claude    │                           │
│   concurrent) │Opus/Sonnet│                          │
│               ├──────────┤                           │
│               │Nano      │                           │
│               │Banana 2  │                           │
│               ├──────────┤                           │
│               │Serper    │                           │
│               │(Search)  │                           │
│               └──────────┘                           │
│                    │                                 │
│                    ▼                                 │
│  MCP-servrar: gws (Google Workspace)                 │
│  HubSpot · LinkedIn · Buffer                         │
└──────────────────────┬───────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼                         ▼
┌────────────────┐  ┌────────────────────────────────┐
│ Kunskapsbas    │  │         Supabase (EU)           │
│ (lokal fil)    │  │  PostgreSQL · Auth · Realtime   │
│ Varumärkes-    │  │                                  │
│ plattform      │  │  Tabeller: agents, tasks,        │
│ Skills         │  │  approvals, metrics, commands,   │
│ Historik       │  │  activity_log, profiles,         │
│                │  │  feedback, system_settings,      │
│                │  │  scheduled_jobs, pending_triggers│
└────────────────┘  └───────────────┬──────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      FIA Dashboard (PWA)       │
                    │  React · Vite · TypeScript     │
                    │  Tailwind · shadcn/ui          │
                    │  fia.forefront.se              │
                    └───────────────────────────────┘
                    ┌───────────────────────────────┐
                    │         FIA CLI                │
                    │  Commander · chalk · boxen     │
                    │  Supabase Realtime (tail/watch)│
                    │  npx fia <command>             │
                    └───────────────────────────────┘
```

**Triple-interface:** Slack, Dashboard och CLI fungerar parallellt. Gateway är källan till sanning – skriver agentdata till Supabase, dashboarden läser via Supabase Realtime, CLI:n pratar med REST API och Supabase direkt (cron-CRUD). Kommandon (pausa, godkänn, kill switch, cron-jobb) kan ges via alla tre gränssnitten. Delad affärslogik i `src/shared/` (display-status, cron-service).

---

## LLM-modeller (multi-modell-routing)

| Modell            | Model ID                 | Användning i FIA                                                                                                                | Pris (per 1M tokens) |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Claude Opus 4.6   | `claude-opus-4-6`        | Orkestrerande huvud-LLM: strategi, komplex analys, varumärkesgranskning (Brand Agent), högrisk-innehåll, blogg, kampanjstrategi | $15 in / $75 ut      |
| Claude Sonnet 4.6 | `claude-sonnet-4-6`      | Metadata, alt-texter, A/B-varianter, lead scoring, klassificering, nurture-sekvenser, rapporter                                 | $3 in / $15 ut       |
| Gemini 2.5 Pro    | `gemini-2.5-pro`         | Fallback för textgenerering, djupanalys                                                                                         | $1.25 in / $10 ut    |
| Gemini 2.5 Flash  | `gemini-2.5-flash`       | Fallback för textgenerering, snabba uppgifter                                                                                   | $0.15 in / $0.60 ut  |
| Nano Banana 2     | `gemini-2.5-flash-image` | Bildgenerering: social media-grafik, blogg-illustrationer, annonskreativ                                                        | ~$0.04/bild          |
| Serper.dev        | `google-custom-search`   | Realtidssökning: omvärldsbevakning, trendspaning, SEO-analys, faktakontroll                                                     | $0.001/sökning       |

### Routinglogik

Varje agents `agent.yaml` definierar ett `routing`-fält som mappar uppgiftstyp → modellalias. Gatewayen läser detta vid laddning – ingen hårdkodning av modellval i kod.

**Giltiga modellalias:** `claude-opus`, `claude-sonnet`, `gemini-pro`, `gemini-flash`, `nano-banana-2`, `google-search`.

Modellaliasens mappning till API-modell-ID:

```typescript
const MODEL_MAP = {
  "claude-opus": "claude-opus-4-6",
  "claude-sonnet": "claude-sonnet-4-6",
  "gemini-pro": "gemini-2.5-pro",
  "gemini-flash": "gemini-2.5-flash",
  "nano-banana-2": "gemini-2.5-flash-image",
  "google-search": "google-custom-search", // Serper API
};
```

`google-search` implementeras via Serper.dev API (Google Custom Search är stängt för nya kunder sedan januari 2026).

### Routing med fallback

Routern stöder ett fallback-system. Varje routing-entry kan vara antingen en enkel sträng (legacy) eller ett objekt med `primary` och valfritt `fallback`:

```yaml
routing:
  default: claude-opus # Legacy: enkel sträng
  deep_analysis: # Objekt med fallback
    primary: claude-opus
    fallback: claude-sonnet
```

`resolveRouteWithFallback()` i `router.ts` försöker primary-modellen först. Vid retryable errors (timeout, rate limit, nätverksfel) faller den automatiskt tillbaka till fallback-modellen. Dashboard-routingeditorn (AgentDetailPage, flik "Routing") stöder redigering av både primary och fallback per uppgiftstyp.

Zod-validering i API:t (`PATCH /api/agents/:slug/routing`) accepterar båda formaten:

```typescript
z.union([
  modelAliasEnum, // Enkel sträng (legacy)
  z.object({
    // Objekt med fallback
    primary: modelAliasEnum,
    fallback: modelAliasEnum.optional(),
  }),
]);
```

---

## Gateway-komponenttabell

| Komponent         | Teknik                               | Syfte                                                            |
| ----------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Runtime           | Node.js ≥20 LTS (PM2)                | Always-on daemon                                                 |
| Språk             | TypeScript (strict mode)             | Typsäkerhet                                                      |
| Scheduler         | node-cron + DynamicScheduler         | Databasdriven schemaläggning (scheduled_jobs-tabell, hot reload) |
| Task Queue        | In-memory prioritetskö               | Max 3 concurrent, prioritetsordning (urgent → low)               |
| Slack             | Bolt SDK (Socket Mode)               | Orchestrator-gränssnitt                                          |
| Modell-router     | Manifest-driven (agent.yaml)         | Dirigerar uppgifter till rätt LLM                                |
| LLM (primär)      | Anthropic SDK (`@anthropic-ai/sdk`)  | Claude Opus 4.6 / Sonnet 4.6 (tool_use för strukturerad output)  |
| LLM (fallback)    | Google GenAI SDK (`@google/genai`)   | Gemini 2.5 Pro / Flash – textgenerering vid fallback             |
| Bildgenerering    | Google GenAI SDK (`@google/genai`)   | Nano Banana 2 via Gemini API                                     |
| Sökning           | Serper.dev API                       | Realtidsdata (Googles sökresultat)                               |
| Kontexthantering  | agent.yaml + markdown + JSON         | system_context, task_context per agent                           |
| Skill-system      | Modulärt (shared: + agent:)          | 6 delade skills + agentspecifika skills                          |
| Loggning          | Strukturerad JSON → Supabase         | Audit trail                                                      |
| Databas-klient    | `@supabase/supabase-js`              | Heartbeats, tasks, metrics, activity_log                         |
| Realtime-lyssnare | Supabase Realtime                    | Kommandon + task-uppdateringar från Dashboard                    |
| REST API          | Express (intern, port 3001)          | Dashboard- och CLI-kommandon                                     |
| CLI               | Commander + chalk + boxen            | Terminalverktyg (16 kommandon, cron CRUD, Supabase Realtime)     |
| Validering        | Zod                                  | Config-validering, API-inputvalidering                           |
| Status Machine    | `src/engine/status-machine.ts`       | Tillåtna statusövergångar, validering                            |
| Trigger Engine    | `src/engine/trigger-engine.ts`       | Deklarativ trigger-matching och exekvering                       |
| Google Workspace  | gws CLI v0.4.4 via MCP               | Drive, Gmail, Calendar, Sheets, Docs                             |
| Hosting           | GCP Compute Engine (europe-north1-b) | EU, GDPR                                                         |

---

## MCP-integrationer

### gws – Google Workspace CLI

Enhetlig integration via gws v0.4.4. Exponerar hela Workspace som MCP-server. Bygger kommandoyta dynamiskt via Googles Discovery Service.

```json
{
  "mcpServers": {
    "gws": {
      "command": "gws",
      "args": ["mcp", "-s", "drive,gmail,calendar,sheets,docs"]
    }
  }
}
```

GA4 stöds INTE via gws – kräver direkta API-anrop mot `analyticsdata.googleapis.com`.

**Autentisering:** OAuth export-flöde (Cloud Shell) → `credentials.json` → absolut sökväg på VPS. SA JSON-nycklar ignoreras tyst i v0.4.4 – OAuth-workaround krävs.

**Kända buggar i v0.4.4:** SA-nycklar ignoreras, tilde expanderar inte, OAuth kräver Cloud Shell, `gws analytics` ej giltigt tjänstnamn.

### MCP-servrar – översikt

| System                                 | Integration                                 | Status          |
| -------------------------------------- | ------------------------------------------- | --------------- |
| Google Workspace                       | gws CLI (MCP-server)                        | Klar – fas 1    |
| — Gmail, Calendar, Drive, Sheets, Docs | via `gws mcp -s`                            | Klar – fas 1    |
| — GA4                                  | Direkt API (`analyticsdata.googleapis.com`) | Fas 2           |
| Slack                                  | Bolt SDK (Socket Mode)                      | Klar            |
| HubSpot                                | Community MCP                               | Valideras fas 2 |
| LinkedIn                               | Custom MCP-wrapper                          | Fas 2           |
| Buffer                                 | Custom MCP-wrapper                          | Fas 2           |

---

## Kunskapsbas

Ingen vektordatabas i v1. Filbaserad organisation i tre delar:

### Delad varumärkeskontext (`knowledge/brand/`)

Filer som alla innehållsagenter delar. Laddas av prompt-builder.

- `platform.md` – Varumärkesplattform
- `tonality.md` – Tonalitetsregler och exempel
- `visual.md` – Visuell identitet
- `messages.md` – Budskapshierarki

### Delade skills (`knowledge/skills/`)

Modulärt skill-system. Varje skill är en `SKILL.md`-fil som kan delas mellan agenter.

| Skill                 | Slug                    | Används av                                       |
| --------------------- | ----------------------- | ------------------------------------------------ |
| Forefront Identity    | `forefront-identity`    | Alla 8 agenter                                   |
| Brand Compliance      | `brand-compliance`      | Content, Brand, Campaign, Lead, Strategy         |
| Swedish Tone          | `swedish-tone`          | Content, Campaign                                |
| Data-Driven Reasoning | `data-driven-reasoning` | Strategy, Campaign, SEO, Analytics, Intelligence |
| Escalation Protocol   | `escalation-protocol`   | Alla 8 agenter                                   |
| GDPR Compliance       | `gdpr-compliance`       | Lead, Analytics                                  |

Skills refereras i `agent.yaml` med prefix: `shared:forefront-identity` för delade, `agent:content-production` för agentspecifika.

### Agentspecifik kontext (`knowledge/agents/<slug>/`)

Manifest-driven via `agent.yaml`. Mappstruktur per agent:

```
knowledge/agents/<slug>/
├── agent.yaml          # Manifest: routing, skills, tools, autonomi, writable
├── SKILL.md            # Legacy – ersätts av skills/-fältet
├── skills/             # Agentspecifika skills (agent:)
│   ├── <skill-1>/SKILL.md
│   └── <skill-2>/SKILL.md
├── context/
│   ├── templates/      # Mallar per innehållstyp
│   └── few-shot/       # Goda/dåliga exempel
├── memory/             # Skrivbar – ackumulerade lärdomar
└── assets/             # Övriga referensfiler
```

### agent.yaml – manifestformat (v1.1.0)

```yaml
name: Content Agent
slug: content
version: 1.1.0

skills: # Modulärt skill-system (nytt i v1.1.0)
  - shared:forefront-identity
  - shared:brand-compliance
  - shared:swedish-tone
  - shared:escalation-protocol
  - agent:content-production
  - agent:channel-adaptation

routing:
  default: claude-opus
  metadata: claude-sonnet
  images: nano-banana-2

system_context: # Alltid i systemprompt
  - context/tone-examples.md

task_context: # On-demand per uppgiftstyp
  blog_post:
    - context/templates/blog-post.md
    - context/few-shot/blog-good.md

tools: # MCP-servrar och gws-tjänster
  - gws:drive
  - gws:docs

autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.2

writable: # Filer agenten får skriva till
  - memory/learnings.json

triggers: # Deklarativa triggers (nytt i v0.5.1)
  - name: example_trigger
    on: task_completed # Event: task_completed | task_approved | task_activated | task_delivered
    condition:
      task_type: [blog_post]
      output_field: "suggested_action"
      output_value: "rapid_response"
    action:
      type: create_task # create_task | notify_slack | escalate
      target_agent: content
      task_type: rapid_response_article
      priority: high
      context_fields: [title, content_json.summary]
    requires_approval: false
    enabled: true
```

---

### Schemaläggbara jobbtyper per agent

Dessa task-typer kan schemaläggas av användaren i Dashboard, CLI och Slack. Trigger-skapade typer (t.ex. `rapid_response_article`, `campaign_setup`) exkluderas — de skapas automatiskt.

| Agent        | Slug         | Schemaläggbara jobbtyper                                                                                          |
| ------------ | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Strategy     | strategy     | `quarterly_plan`, `monthly_plan`, `campaign_brief`, `research`, `trend_analysis`                                  |
| Content      | content      | `blog_post`, `linkedin`, `newsletter`, `case_study`, `whitepaper`, `metadata`, `alt_text`, `ab_variants`, `images` |
| Campaign     | campaign     | `email_sequence`, `ad_copy`, `landing_page`, `ab_variants`, `segmentation`                                        |
| SEO          | seo          | `seo_audit`, `keyword_research`, `bulk_optimization`, `content_recommendations`                                   |
| Lead         | lead         | `lead_scoring`, `nurture_email`, `nurture_sequences`                                                              |
| Analytics    | analytics    | `morning_pulse`, `weekly_report`, `quarterly_review`, `anomaly_detection`                                         |
| Brand        | brand        | `default`                                                                                                         |
| Intelligence | intelligence | `morning_scan`, `midday_sweep`, `weekly_intelligence`                                                             |

> **Källa:** `fia-frontend/src/types/fia.ts` (`AGENT_TASK_TYPES`) och `fia/src/shared/task-types.ts`. Backend validerar i `cron-service.ts`.