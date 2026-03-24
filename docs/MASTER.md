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

| Agent        | Slug         | Schemaläggbara jobbtyper                                                                                           |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Strategy     | strategy     | `quarterly_plan`, `monthly_plan`, `campaign_brief`, `research`, `trend_analysis`                                   |
| Content      | content      | `blog_post`, `linkedin`, `newsletter`, `case_study`, `whitepaper`, `metadata`, `alt_text`, `ab_variants`, `images` |
| Campaign     | campaign     | `email_sequence`, `ad_copy`, `landing_page`, `ab_variants`, `segmentation`                                         |
| SEO          | seo          | `seo_audit`, `keyword_research`, `bulk_optimization`, `content_recommendations`                                    |
| Lead         | lead         | `lead_scoring`, `nurture_email`, `nurture_sequences`                                                               |
| Analytics    | analytics    | `morning_pulse`, `weekly_report`, `quarterly_review`, `anomaly_detection`                                          |
| Brand        | brand        | `default`                                                                                                          |
| Intelligence | intelligence | `morning_scan`, `midday_sweep`, `weekly_intelligence`                                                              |

> **Källa:** `fia-frontend/src/types/fia.ts` (`AGENT_TASK_TYPES`) och `fia/src/shared/task-types.ts`. Backend validerar i `cron-service.ts`.

---

## Agentkluster – alla åtta

### Agent 1: Strategy Agent

```yaml
name: Strategy Agent
slug: strategy
version: 1.1.0
skills:
  - shared:forefront-identity
  - shared:brand-compliance
  - shared:data-driven-reasoning
  - shared:escalation-protocol
  - agent:strategic-planning
  - agent:market-analysis
routing:
  default: claude-opus
  research: google-search
  trend_analysis: google-search
system_context:
  - context/planning-framework.md
task_context:
  quarterly_plan: [context/templates/quarterly-plan.md]
  monthly_plan: [context/templates/monthly-plan.md]
  campaign_brief: [context/templates/campaign-brief.md]
tools: [gws:analytics, gws:calendar, gws:sheets, hubspot]
autonomy: semi-autonomous
escalation_threshold: 1
sample_review_rate: 1.0
writable: [memory/campaign-history.json]

triggers:
  - name: brief_to_content
    on: task_activated
    condition: { task_type: [campaign_brief] }
    action:
      {
        type: create_task,
        target_agent: content,
        task_type: campaign_content,
        priority: normal,
        context_fields: [title, content_json],
      }
    requires_approval: false
  - name: brief_to_campaign
    on: task_activated
    condition: { task_type: [campaign_brief] }
    action:
      {
        type: create_task,
        target_agent: campaign,
        task_type: campaign_setup,
        priority: normal,
        context_fields: [title, content_json],
      }
    requires_approval: true
```

### Agent 2: Content Agent

```yaml
name: Content Agent
slug: content
version: 1.1.0
skills:
  - shared:forefront-identity
  - shared:brand-compliance
  - shared:swedish-tone
  - shared:escalation-protocol
  - agent:content-production
  - agent:channel-adaptation
routing:
  default: claude-opus
  metadata: claude-sonnet
  alt_text: claude-sonnet
  ab_variants: claude-sonnet
  images: nano-banana-2
system_context:
  - context/tone-examples.md
task_context:
  blog_post:
    - context/templates/blog-post.md
    - context/few-shot/blog-good.md
    - context/few-shot/blog-bad.md
  linkedin:
    - context/templates/linkedin-post.md
    - context/few-shot/linkedin-good.md
    - context/few-shot/linkedin-bad.md
  newsletter: [context/templates/newsletter.md]
  case_study: [context/templates/case-study.md]
  whitepaper: [context/templates/whitepaper.md]
tools: [buffer, gws:drive, gws:docs]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.2
writable: [memory/learnings.json, memory/feedback-log.json]
```

Fas 3: `memory/feedback-summary.json` injiceras i `system_context` vid varje körning. Gateway genererar denna periodiskt från feedback-tabellen. Se avsnittet "Feedback-loop" nedan.

### Agent 3: Campaign Agent

```yaml
name: Campaign Agent
slug: campaign
version: 1.1.0
skills:
  - shared:forefront-identity
  - shared:brand-compliance
  - shared:swedish-tone
  - shared:data-driven-reasoning
  - shared:escalation-protocol
  - agent:campaign-execution
  - agent:ab-testing
routing:
  default: claude-opus
  ab_variants: claude-sonnet
  segmentation: claude-sonnet
system_context: []
task_context:
  email_sequence: [context/templates/email-sequence.md]
  ad_copy: [context/templates/ad-copy.md]
  landing_page: [context/templates/landing-page.md]
tools: [hubspot, linkedin, buffer]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.33
budget_limit_sek: 10000
writable: [memory/ab-test-results.json]
```

### Agent 4: SEO Agent

```yaml
name: SEO Agent
slug: seo
version: 1.1.0
skills:
  - shared:forefront-identity
  - shared:data-driven-reasoning
  - shared:escalation-protocol
  - agent:keyword-research
  - agent:on-page-optimization
routing:
  default: google-search
  bulk_optimization: claude-sonnet
  content_recommendations: claude-opus
system_context: [context/geo-guidelines.md]
task_context:
  seo_audit: [context/templates/seo-audit.md]
tools: [gws:analytics, gws:sheets]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.0
writable: [memory/keyword-rankings.json, memory/opportunities.json]

triggers:
  - name: seo_recommendations_to_content
    on: task_approved
    condition: { task_type: [seo_audit], output_field: "has_content_recommendations", output_value: "true" }
    action:
      {
        type: create_task,
        target_agent: content,
        task_type: seo_optimization,
        priority: normal,
        context_fields: [content_json.recommendations],
      }
    requires_approval: true
```

### Agent 5: Lead Agent

```yaml
name: Lead Agent
slug: lead
version: 1.1.0
skills:
  - shared:forefront-identity
  - shared:brand-compliance
  - shared:gdpr-compliance
  - shared:escalation-protocol
  - agent:lead-scoring
  - agent:nurture-sequences
routing:
  default: claude-sonnet
  nurture_sequences: claude-opus
system_context: []
task_context:
  nurture_email: [context/templates/nurture-email.md]
tools: [hubspot]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.0
score_threshold_mql: 75
writable: [memory/scoring-calibration.json]
```

### Agent 6: Analytics Agent

```yaml
name: Analytics Agent
slug: analytics
version: 1.1.0
skills:
  - shared:forefront-identity
  - shared:data-driven-reasoning
  - shared:gdpr-compliance
  - shared:escalation-protocol
  - agent:reporting
  - agent:anomaly-detection
routing:
  default: claude-sonnet
  insights: claude-opus
  report_writing: claude-opus
system_context: []
task_context:
  morning_pulse: [context/templates/morning-pulse.md]
  weekly_report: [context/templates/weekly-report.md]
  quarterly_review: [context/templates/quarterly-review.md]
tools: [gws:analytics, gws:sheets, gws:drive, hubspot]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.0
writable: [memory/baseline-metrics.json]

triggers:
  - name: anomaly_escalation
    on: task_completed
    condition: { task_type: [anomaly_detection], score_field: "severity", score_above: 0.8 }
    action: { type: escalate, channel: "#fia-orchestrator" }
    requires_approval: false
```

### Agent 7: Brand Agent

```yaml
name: Brand Agent
slug: brand
version: 1.1.0
skills:
  - shared:forefront-identity
  - shared:brand-compliance
  - shared:escalation-protocol
  - agent:brand-review
  - agent:quality-scoring
routing:
  default: claude-opus
system_context:
  - context/review-checklist.md
  - context/few-shot/review-approved.md
  - context/few-shot/review-rejected.md
task_context: {}
tools: []
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.0
has_veto: true
writable: [memory/rejection-patterns.json]
```

### Agent 8: Intelligence Agent

```yaml
name: Intelligence Agent
slug: intelligence
version: 1.1.0
skills:
  - shared:forefront-identity
  - shared:data-driven-reasoning
  - shared:escalation-protocol
  - agent:source-monitoring
  - agent:relevance-scoring
  - agent:briefing-generation
routing:
  default: claude-sonnet
  deep_analysis: claude-opus
  search: google-search
system_context:
  - context/watch-domains.yaml
  - context/scoring-criteria.yaml
task_context:
  morning_scan: [context/templates/morning-scan.md]
  midday_sweep: [context/templates/morning-scan.md]
  weekly_intelligence: [context/templates/weekly-brief.md]
  rapid_response: [context/templates/rapid-response.md]
tools: [gws:drive, gws:docs, gws:sheets]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.2
max_iterations: 5
self_eval:
  enabled: true
  model: claude-sonnet
  criteria:
    - "Är alla fynd relevanta för Forefront och bevakningsdomänerna?"
    - "Är scoring-motiveringar tydliga och konsekventa?"
    - "Är briefen koncis och handlingsorienterad?"
  threshold: 0.7
writable: [memory/source-history.json, memory/scoring-calibration.json, memory/learnings.json]

triggers:
  - name: rapid_response_to_content
    on: task_completed
    condition:
      { task_type: [morning_scan, midday_sweep], output_field: "suggested_action", output_value: "rapid_response" }
    action:
      {
        type: create_task,
        target_agent: content,
        task_type: rapid_response_article,
        priority: high,
        context_fields: [title, content_json.summary, content_json.implications],
      }
    requires_approval: false
  - name: strategy_input_to_strategy
    on: task_completed
    condition:
      { task_type: [morning_scan, midday_sweep], output_field: "suggested_action", output_value: "strategy_input" }
    action:
      {
        type: create_task,
        target_agent: strategy,
        task_type: strategic_input,
        priority: normal,
        context_fields: [title, content_json.summary, content_json.implications],
      }
    requires_approval: true
  - name: escalate_critical
    on: task_completed
    condition: { task_type: [morning_scan, midday_sweep], output_field: "suggested_action", output_value: "escalate" }
    action: { type: notify_slack, channel: "#fia-orchestrator" }
    requires_approval: false
```

**Multi-steg-pipeline:**

1. **Gather** – Söker alla bevakningsdomäner och fasta källor via Serper (google-search). Dedup mot `source-history.json` (72-timmars fönster).
2. **Signal scoring** – Sonnet bedömer varje fynd på fyra dimensioner (domain_relevance, forefront_impact, actionability, recency_novelty) via `signal_scoring` tool_use. Viktas mot domänvikt → composite score.
3. **Deep analysis** – Opus djupanalyserar fynd med score ≥ 0.7 via `deep_analysis` tool_use. Ger summary, implications, suggested_action (brief/rapid_response/strategy_input/escalate), confidence.
4. **Rapid response** – Fynd med `suggested_action: rapid_response` skapar automatiskt en high-priority task åt Content Agent. `escalate`-fynd skickar Slack-notis till Orchestrator.
5. **Briefing** – Opus genererar en strukturerad rapport med toppfynd, bevakningsradar och statistik.

**Bevakningsdomäner:** Konfigureras via `context/watch-domains.yaml` med vikter, primära/sekundära nyckelord, entiteter (konkurrenter) och exkluderingsregler per domän. Fasta källor (pinned_sources) söks separat med site:-prefix.

**Veckobriefing:** Sammanställer alla scans från senaste 7 dagarna + source-history till en strukturerad veckobriefing (top 5, per domän, konkurrentöversikt, trender, rekommendationer).

### Autonominivåer per innehållstyp

| Typ                      | Autonomi                             | Stickprov |
| ------------------------ | ------------------------------------ | --------- |
| Social media (organiskt) | Full autonom                         | 1 av 5    |
| Blogginlägg              | Autonom + Brand Agent                | 1 av 3    |
| Nyhetsbrev               | Autonom + Brand Agent + Orchestrator | Alla      |
| Kundcase / pressrelease  | Semi-autonom, Orchestrator godkänner | Alla      |

---

## Task Status & Trigger Engine

### Designprinciper

- **En enum, alla agenter.** Ingen agentspecifik status-kolumn. Alla statusar lever i `tasks.status`. Varje agent använder en delmängd.
- **Bakåtkompatibel.** Alla befintliga statusar behålls. `published` fasas ut till förmån för `delivered` men behålls under en övergångsperiod.
- **Statusar beskriver task-tillstånd, inte affärslogik.** `delivered` = "gateway har levererat output", inte "publicerad på LinkedIn".

### Komplett status-enum

| Status             | Beskrivning                                             | Ny?                      |
| ------------------ | ------------------------------------------------------- | ------------------------ |
| queued             | Väntar i task queue                                     | Befintlig                |
| in_progress        | Agent arbetar                                           | Befintlig                |
| completed          | Agent klar med exekvering, inväntar nästa steg          | Befintlig (omdefinierad) |
| awaiting_review    | Väntar på granskning (Brand Agent / Orchestrator)       | Befintlig                |
| approved           | Godkänd av granskare                                    | Befintlig                |
| rejected           | Underkänd av granskare                                  | Befintlig                |
| revision_requested | Tillbakaskickad för omarbetning                         | Ny                       |
| delivered          | Slutlevererad — redo att ageras på av människa          | Ny (ersätter published)  |
| activated          | Plan/brief aktiverad — styr downstream-beteende         | Ny                       |
| triggered          | Har skapat downstream-task(s)                           | Ny                       |
| acknowledged       | Människa har kvitterat (sett/noterat)                   | Ny                       |
| live               | Kampanj eller sekvens körs aktivt                       | Ny                       |
| paused_task        | Kampanj eller sekvens pausad (ej agent-pause)           | Ny                       |
| ended              | Kampanj eller sekvens avslutad                          | Ny                       |
| published          | Deprecated. Behålls i constraint, nya tasks → delivered | Befintlig                |
| error              | Fel vid exekvering                                      | Befintlig                |

### Tillåtna statusövergångar

Gateway enforcear dessa övergångar i `status-machine.ts`. Ogiltiga övergångar loggas som varning.

```
queued → in_progress
in_progress → completed | error
completed → awaiting_review | delivered | triggered | acknowledged
awaiting_review → approved | rejected | revision_requested
approved → delivered | activated | live
rejected → (terminal)
revision_requested → in_progress
delivered → acknowledged | triggered
activated → triggered
triggered → (terminal)
acknowledged → (terminal)
live → paused_task | ended | error
paused_task → live | ended
ended → (terminal)
error → queued (vid manuell retry)
```

### Statusflöden per agent

**Content Agent:** `queued → in_progress → completed → awaiting_review → approved → delivered`

**Strategy Agent:** `queued → in_progress → completed → awaiting_review → approved → activated → triggered`

**Campaign Agent:** `queued → in_progress → completed → awaiting_review → approved → live → paused_task → live → ended`

**Intelligence Agent (briefing):** `queued → in_progress → completed → delivered → acknowledged`

**Intelligence Agent (action):** `queued → in_progress → completed → triggered`

**Analytics Agent (rapport):** `queued → in_progress → completed → delivered`

**SEO Agent (audit):** `queued → in_progress → completed → delivered → acknowledged`

**SEO Agent (rekommendation):** `queued → in_progress → completed → awaiting_review → approved → triggered`

### Trigger Engine

Deklarativ + konfigurerbar autonomi. Triggers seedas från `agent.yaml` till `config_json.triggers` i Supabase vid gateway-startup. Dashboarden äger konfigurationen efter seed. Varje trigger har en `requires_approval`-flagg.

**Trigger-events:**

| Event            | Matchar status | Typisk användning                   |
| ---------------- | -------------- | ----------------------------------- |
| task_completed   | completed      | Intelligence → Content              |
| task_approved    | approved       | SEO audit → Content                 |
| task_activated   | activated      | Strategy brief → Campaign + Content |
| task_delivered   | delivered      | Rapport → notifiering               |
| anomaly_detected | completed      | Analytics anomali → eskalering      |

**Condition-matching (AND-logik):**

| Fält         | Typ            | Beskrivning                              |
| ------------ | -------------- | ---------------------------------------- |
| task_type    | string / array | Matchar task-typ (OR om array)           |
| output_field | string         | Dot-notation-sökväg i content_json       |
| output_value | string / array | Värde(n) att matcha (OR om array)        |
| score_above  | number         | Numeriskt villkor (t.ex. severity > 0.8) |
| score_field  | string         | Dot-notation till score-fält             |

**Trigger-actions:**

| type         | Beskrivning                                 |
| ------------ | ------------------------------------------- |
| create_task  | Skapar ny task i target_agent-kön           |
| notify_slack | Skickar Slack-meddelande till angiven kanal |
| escalate     | Skapar eskaleringspost i pending_triggers   |

**Exekveringsflöde:**

1. Task ändrar status (t.ex. → `completed`)
2. `trigger-engine.ts` anropas efter statusändring
3. Laddar triggers från källagentens `config_json.triggers` (Supabase)
4. Matchar event + condition
5. `requires_approval == false` → skapar downstream-task direkt → källtask → `triggered`
6. `requires_approval == true` → skapar rad i `pending_triggers` → Orchestrator godkänner/avslår i Dashboard

**Loopskydd:** `MAX_TRIGGER_DEPTH = 3`. Depth spåras via `parent_task_id`-kedjan. Tasks med depth ≥ 3 triggar aldrig nya tasks.

### Aktiva triggers (v0.5.1)

| Agent        | Trigger                        | Event          | Auto? |
| ------------ | ------------------------------ | -------------- | ----- |
| Intelligence | rapid_response_to_content      | task_completed | Ja    |
| Intelligence | strategy_input_to_strategy     | task_completed | Nej   |
| Intelligence | escalate_critical              | task_completed | Ja    |
| Strategy     | brief_to_content               | task_activated | Ja    |
| Strategy     | brief_to_campaign              | task_activated | Nej   |
| Analytics    | anomaly_escalation             | task_completed | Ja    |
| SEO          | seo_recommendations_to_content | task_approved  | Nej   |

---

## Supabase-datamodell (MASTER)

### profiles

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',  -- orchestrator | admin | viewer
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### agents

```sql
CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'idle',             -- active | paused | error | idle
  autonomy_level text NOT NULL,
  last_heartbeat timestamptz,
  config_json jsonb DEFAULT '{}',                  -- Routing, tools och övrig konfiguration
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Notering: Routing och tools lagras i `config_json` (inte separata kolumner). Gateway populerar detta vid uppstart från `agent.yaml`.

### tasks

```sql
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  -- queued | in_progress | completed | awaiting_review | approved | rejected | revision_requested
  -- | delivered | activated | triggered | acknowledged | live | paused_task | ended
  -- | published (deprecated) | error
  priority text NOT NULL DEFAULT 'normal',
  content_json jsonb,
  model_used text,
  tokens_used integer,
  cost_sek numeric,
  source text,                                      -- gateway | dashboard | scheduler | trigger | cli
  parent_task_id uuid REFERENCES tasks(id),         -- trigger engine: downstream-relation
  trigger_source text,                               -- trigger-namn som skapade denna task
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
```

Notering: `parent_task_id` och `trigger_source` tillagda i migration 013 för trigger engine. Status-constraint utökad med 10 nya statusar.

### content_json – standardiserat schema (fas 2)

Alla innehållsproducerande agenter skriver till `tasks.content_json` med ett gemensamt format. Gateway validerar output via Zod/JSON Schema innan skrivning till Supabase.

```json
{
  "content_type": "blog_post",
  "title": "Rubrik",
  "body": "## Markdown-formaterad brödtext\n\nMed full stöd...",
  "summary": "Kort sammanfattning för listvy (max 200 tecken)",
  "media": [
    {
      "type": "image",
      "url": "https://drive.google.com/...",
      "alt": "Beskrivande alt-text",
      "placement": "hero"
    }
  ],
  "channel_hints": {
    "linkedin": {
      "character_count": 1847,
      "hashtags": ["#AI", "#Transformation"],
      "hook_line": "Första raden som syns i flödet"
    },
    "email": {
      "subject_line": "Ämnesrad",
      "preview_text": "Preheader-text"
    }
  },
  "metadata": {
    "word_count": 842,
    "reading_time_min": 4,
    "seo_keywords": ["ai automation", "marketing"],
    "target_audience": "CTO/CDO i svenska företag"
  }
}
```

Princip: `body` är alltid markdown – universell representation. `channel_hints` är kanalspecifika metadata för dashboard-preview. `media` refererar Google Drive-URL:er – ingen bildstorage i Supabase.

### approvals

```sql
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  reviewer_type text NOT NULL,                     -- brand_agent | orchestrator | ledningsgrupp
  reviewer_id uuid REFERENCES profiles(id),
  decision text NOT NULL,                          -- approved | rejected | revision_requested
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### feedback

```sql
CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  reviewer_id uuid NOT NULL REFERENCES profiles(id),
  overall_score smallint NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  dimensions_json jsonb NOT NULL DEFAULT '{}',
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`dimensions_json`-schema: `{ "tonality": 1-5, "accuracy": 1-5, "clarity": 1-5, "brand_fit": 1-5, "channel_fit": 1-5 }`. Dimensioner kan utökas per innehållstyp utan schemaändring.

### metrics

```sql
CREATE TABLE metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  metric_name text NOT NULL,
  value numeric NOT NULL,
  period text NOT NULL,
  period_start date NOT NULL,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### activity_log

```sql
CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id),
  user_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  details_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### commands (Dashboard → Gateway)

```sql
CREATE TABLE commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type text NOT NULL,                      -- pause_agent | resume_agent | approve_task | reject_task | revision_task | kill_switch | update_config | update_schedule | reseed_triggers
  target_slug text,
  payload_json jsonb,
  issued_by uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'pending',          -- pending | processing | completed | failed
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
```

### system_settings (Kill Switch m.m.)

```sql
CREATE TABLE system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);
```

Används av Dashboard för kill switch-status (`key = 'kill_switch'`). RLS: alla autentiserade kan SELECT, orchestrator/admin kan UPDATE.

### pending_triggers

```sql
CREATE TABLE pending_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_task_id uuid NOT NULL REFERENCES tasks(id),
  trigger_name text NOT NULL,
  target_agent_slug text NOT NULL,
  target_task_type text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  context_json jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | executed
  decided_by uuid REFERENCES profiles(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Triggers med `requires_approval: true` skapar rader här. Orchestrator godkänner/avslår via Dashboard eller API. Vid godkännande skapas downstream-task och status → `executed`.

### scheduled_jobs

```sql
CREATE TABLE scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  title text NOT NULL,
  task_type text NOT NULL,
  cron_expression text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  description text,
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Notering: Hanteras dynamiskt av DynamicScheduler (`src/gateway/scheduler.ts`). Gateway läser alla enabled jobb vid uppstart, node-cron schemalägger dem, och `update_schedule`-command triggar hot reload. CRUD via Dashboard, CLI (`fia cron`) och Slack (`/fia cron`). 10 default-jobb seedades via migration 014.

### Migrationer

| #   | Fil                                         | Beskrivning                                                                             |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| 001 | `001_initial_schema.sql`                    | Komplett schema med 6 tabeller + RLS                                                    |
| 002 | `002_remove_task_type_check.sql`            | Tog bort rigid type-enum (`agent.yaml` är källa)                                        |
| 003 | `003_add_error_status.sql`                  | Lade till `error` i task status-constraint                                              |
| 004 | `004_add_source_and_metrics_constraint.sql` | `source`-fält på tasks, metrics-constraint                                              |
| 005 | `005_fix_metrics_constraint.sql`            | Fixade metrics-constraint                                                               |
| 006 | `006_add_update_task_status_fn.sql`         | RPC-funktion `update_task_status()`                                                     |
| 007 | `007_drop_cost_ledger_trigger.sql`          | Droppade `cost_ledger`-tabell och trigger                                               |
| 008 | `008_add_commands_table.sql`                | Dashboard → Gateway command queue + RLS                                                 |
| 009 | `009_add_intelligence_agent.sql`            | Intelligence agent konfiguration                                                        |
| 010 | `010_add_operator_role.sql`                 | `operator`-roll i profiles                                                              |
| 011 | `011_backfill_agent_config_json.sql`        | Populerar `config_json` från manifestfiler                                              |
| 012 | `012_nullable_commands_issued_by.sql`       | `commands.issued_by` nullable                                                           |
| 013 | `013_extended_task_status_and_triggers.sql` | Utökad status-constraint, `parent_task_id`, `trigger_source`, `pending_triggers`-tabell |
| 014 | `014_seed_scheduled_jobs.sql`               | `scheduled_jobs`-tabell + seed av 10 default cron-jobb                                  |

### Row Level Security

```sql
-- SELECT: alla inloggade
CREATE POLICY "select_all" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON agents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON tasks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON approvals FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON metrics FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON activity_log FOR SELECT USING (auth.uid() IS NOT NULL);

-- UPDATE: orchestrator/admin
CREATE POLICY "update_agents" ON agents FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);
CREATE POLICY "update_tasks" ON tasks FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);

-- INSERT: orchestrator/admin
CREATE POLICY "insert_approvals" ON approvals FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);
CREATE POLICY "insert_commands" ON commands FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);
CREATE POLICY "select_commands" ON commands FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);

-- feedback
CREATE POLICY "select_feedback" ON feedback FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "insert_feedback" ON feedback FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);

-- pending_triggers
CREATE POLICY "select_triggers" ON pending_triggers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "insert_triggers" ON pending_triggers FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);
CREATE POLICY "update_triggers" ON pending_triggers FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);

-- Commands UPDATE: Gateway via service role key
```

### Realtid-prenumerationer

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE agents, tasks, activity_log, commands, system_settings, feedback, pending_triggers;
```

---

## REST API-kontrakt (MASTER)

### Autentisering

Alla anrop kräver `Authorization: Bearer <token>`. Två auth-metoder:

1. **Supabase JWT** – Dashboard och externa klienter. Valideras mot Supabase Auth, roll hämtas från `profiles`.
2. **FIA_CLI_TOKEN** – CLI-klient. Enkel token i `.env` som ger admin-roll utan JWT-validering.

### Felformat

```json
{ "error": { "code": "FORBIDDEN", "message": "Rollen 'viewer' har inte behörighet." } }
```

Statuskoder: 200, 201, 400, 401, 403, 404, 500.

### Agenter

- `GET /api/agents` – Alla inloggade. Returnerar alla åtta med status, heartbeat, routing, tools, uppgiftsräknare.
- `GET /api/agents/:slug` – Alla inloggade. Utökad info inkl. `config_json`.
- `POST /api/agents/:slug/pause` – Orchestrator, Admin. Skriver till `commands`.
- `POST /api/agents/:slug/resume` – Orchestrator, Admin. Skriver till `commands`.
- `PUT /api/agents/:slug/config` – Admin. Body: `{ "config_json": { ... } }`
- `PATCH /api/agents/:slug/routing` – Admin. Body: `{ "routing": { "<task_type>": "<alias>" | { "primary": "<alias>", "fallback": "<alias>" } } }`. Zod-validerad. Uppdaterar routing i `config_json`.
- `PATCH /api/agents/:slug/tools` – Admin. Body: `{ "tools": ["gws:drive", ...] }`. Uppdaterar tools i `config_json`.

### Uppgifter

- `GET /api/tasks` – Alla inloggade. Query: `status` (kommaseparerad, t.ex. `queued,in_progress`), `agent_slug`, `type`, `priority`, `page`, `per_page`, `sort`.
- `GET /api/tasks/:id` – Alla inloggade. Med `content_json` och `approvals`.
- `POST /api/tasks` – Orchestrator, Admin, Operator. Body: `{ "agent_slug": "content", "type": "blog_post", "title": "...", "priority": "normal" }`. Skapar task med status `queued`. Används av CLI (`fia run`).
- `POST /api/tasks/:id/approve` – Orchestrator, Admin, Operator. Body: `{ "feedback": "..." }` (valfritt). Skapar approval + command.
- `POST /api/tasks/:id/reject` – Orchestrator, Admin, Operator. Body: `{ "feedback": "..." }` (obligatoriskt).
- `POST /api/tasks/:id/revision` – Orchestrator, Admin, Operator. Body: `{ "feedback": "..." }`.

### Metrics

- `GET /api/metrics` – Alla inloggade. Query: `category`, `period`, `from`, `to`.
- `GET /api/metrics/summary` – Alla inloggade. Förberäknade KPI-kort.

### Aktivitetslogg

- `GET /api/activity` – Alla inloggade. Query: `agent_slug`, `action`, `from`, `to`, `search`, `page`, `per_page`.

### Kill switch

- `POST /api/kill-switch` – Orchestrator, Admin. Body: `{ "action": "activate" | "deactivate" }`. Skriver till `commands`.
- `GET /api/kill-switch/status` – Alla inloggade.

### Triggers (nytt i 0.5.1)

- `GET /api/triggers/pending` – Orchestrator, Admin. Listar väntande triggers med källtask-info.
- `POST /api/triggers/:id/approve` – Orchestrator, Admin. Godkänner och exekverar trigger (skapar downstream-task).
- `POST /api/triggers/:id/reject` – Orchestrator, Admin. Avslår trigger. Body: `{ "reason": "..." }`.

### Trigger Configuration (nytt i 0.5.2)

- `GET /api/agents/:slug/triggers` – Alla inloggade. Returnerar triggers från config_json.
- `PATCH /api/agents/:slug/triggers` – Orchestrator, Admin. Partiell uppdatering per trigger-namn. Validerar target_agent, loggar before/after-diff.
- `POST /api/agents/:slug/triggers/reseed` – Admin. Återställer triggers från agent.yaml. Utan `confirm: true` returneras dry-run-diff.
- `POST /api/triggers/reseed` – Admin. Återställer alla agenters triggers. Samma dry-run/confirm-mönster.

### Task-relationer och statusändring (nytt i 0.5.1)

- `POST /api/tasks/:id/status` – Orchestrator, Admin. Body: `{ "status": "acknowledged" }`. Generellt endpoint för statusändringar. Validerar mot övergångstabellen.
- `GET /api/tasks/:id/children` – Alla inloggade. Returnerar tasks med `parent_task_id = :id`.
- `GET /api/tasks/:id/lineage` – Alla inloggade. Returnerar ancestors + children (max 5 nivåer).

### Feedback (fas 3)

- `POST /api/tasks/:id/feedback` – Orchestrator, Admin. Body: `{ "overall_score": 1-5, "dimensions_json": { "tonality": 4, "accuracy": 5, "clarity": 3, "brand_fit": 4, "channel_fit": 4 }, "comment": "..." }`. Skapar feedback-rad.
- `GET /api/agents/:slug/feedback-summary` – Alla inloggade. Returnerar aggregerad feedback med trender.

---

## Headless-arkitektur

### Grundregel

Frontend och backend är helt separerade. Frontenden kommunicerar enbart via: (1) FIA API (REST), (2) Supabase Auth (JWT), (3) Supabase Realtime (websocket).

### Kommandoflöde (Dashboard → Gateway)

1. Dashboard anropar Edge Function (t.ex. `POST /api/agents/content/pause`)
2. Edge Function validerar JWT + roll
3. Edge Function skriver till `commands`-tabellen
4. Gateway lyssnar via Supabase Realtime (`command-listener.ts`) och exekverar
5. Gateway uppdaterar `agents`/`tasks` → Dashboard ser via Realtime

### Ansvarsfördelning

| Lager    | Ansvarig för                                    | Ansvarar INTE för                |
| -------- | ----------------------------------------------- | -------------------------------- |
| Frontend | Rendering, navigation, UX, PWA                  | Affärslogik, autentiseringslogik |
| FIA API  | Auth, auktorisering, validering, commands       | Rendering, layout                |
| Gateway  | Agentexekvering, LLM-anrop, MCP, schemaläggning | Användarhantering, UI            |

### Frontendregler

1. Noll direkt DB-mutation – allt via FIA API
2. Läsning via Supabase-klient tillåtet (SELECT + Realtime)
3. Alla API-anrop via centralt servicelager (`fia-api.ts`)
4. Env-variabler för alla URL:er
5. Ingen Lovable-specifik kod

### Migrationsväg

| Fas | Host           | Ändring                 |
| --- | -------------- | ----------------------- |
| MVP | Lovable        | Custom domän            |
| V2  | Vercel/Netlify | Byt DNS + env           |
| V3  | Egen server    | `npm run build` → Nginx |

### Dashboard – teknisk arkitektur

#### Teknikstack

| Komponent      | Teknik                           | Version          |
| -------------- | -------------------------------- | ---------------- |
| UI-ramverk     | React                            | 18.3.1           |
| Byggverktyg    | Vite (SWC)                       | 5.4.19           |
| Språk          | TypeScript                       | 5.8.3            |
| Styling        | Tailwind CSS + shadcn/ui (Radix) | 3.4.17           |
| Server state   | TanStack React Query             | 5.83.0           |
| Routing        | React Router DOM                 | 6.30.1           |
| Formulär       | React Hook Form + Zod            | 7.61.1 / 3.25.76 |
| Grafer         | Recharts                         | 2.15.4           |
| Ikoner         | Lucide React                     | 0.462.0          |
| i18n           | i18next + react-i18next          | 25.8.17 / 16.5.6 |
| Backend-klient | @supabase/supabase-js            | 2.99.0           |
| Test           | Vitest + Testing Library         | 3.2.4            |

#### Komponentstruktur

```
src/
├── components/           # React-komponenter
│   ├── ui/              # shadcn/ui (genererade Radix-baserade)
│   ├── AppSidebar.tsx   # Navigation (sidebar)
│   ├── DashboardLayout.tsx  # Layout-wrapper
│   ├── TaskContent.tsx  # Task-rendering
│   ├── FeedbackDialog.tsx   # Feedback-modal
│   ├── RunTaskDialog.tsx    # Manuell task-trigger
│   ├── TaskDetailSheet.tsx  # Task-detaljvy (sheet, parent/children)
│   ├── triggers/           # Trigger-konfig (nytt i 0.5.2)
│   │   ├── AgentTriggersTab.tsx    # Flik i AgentDetailPage
│   │   ├── TriggerCard.tsx         # Expanderbart trigger-kort
│   │   ├── TriggerConditionEditor.tsx
│   │   ├── TriggerActionEditor.tsx
│   │   ├── TriggerEventBadge.tsx
│   │   ├── TriggerApprovalBadge.tsx
│   │   ├── AgentTriggerGroup.tsx
│   │   ├── TriggerSummaryRow.tsx
│   │   ├── TriggerReseedSection.tsx
│   │   ├── ReseedDiffPanel.tsx
│   │   └── ReseedConfirmDialog.tsx
│   ├── TaskStatusBadge.tsx # Task-status med ikoner/färger (17 statusar)
│   ├── SystemHealthCard.tsx # Systemhälsa-kort
│   ├── AgentPerformance.tsx # Agent-prestandagraf
│   ├── ThemePicker.tsx      # Temväljare
│   ├── LanguageSwitcher.tsx # Språkväxlare (sv/en)
│   └── MobileBottomNav.tsx  # Mobil-navigation
├── pages/               # Sidor (route-level)
│   ├── DashboardPage.tsx    # Hem: KPI, agentpuls, senaste tasks
│   ├── LoginPage.tsx        # Inloggning
│   ├── AgentsListPage.tsx   # Alla agenter
│   ├── AgentDetailPage.tsx  # Agentdetalj (/:slug)
│   ├── ApprovalsPage.tsx    # Godkännandekö
│   ├── TriggersPage.tsx     # Trigger-godkännandekö (nytt i 0.5.1)
│   ├── TriggersConfigPage.tsx # Trigger-konfiguration (nytt i 0.5.2)
│   ├── CalendarPage.tsx     # Kalender + schemalagda jobb
│   ├── ActivityPage.tsx     # Aktivitetslogg
│   ├── SettingsPage.tsx     # Inställningar
│   ├── CostsPage.tsx        # Kostnadsöversikt
│   └── InstallPage.tsx      # PWA-installation
├── contexts/            # React Context
│   ├── AuthContext.tsx   # Auth-state, login/signup/logout
│   └── ThemeContext.tsx  # Tema-state, persistering
├── hooks/               # Custom hooks
│   ├── use-fia-data.ts  # 40+ hooks (queries + mutations)
│   └── use-realtime-sync.ts  # Supabase Realtime-prenumeration
├── services/
│   └── fia-api.ts       # 60+ API-funktioner (centralt servicelager)
├── integrations/supabase/
│   ├── client.ts        # Supabase-klientinstans
│   └── types.ts         # Auto-genererade typer
├── types/fia.ts         # Applikationstyper
├── i18n/                # sv.ts + en.ts (409 rader per språk)
└── lib/utils.ts         # Hjälpfunktioner (cn, cron-helpers)
```

#### Routing

```
/login                   → LoginPage (publik)
/install                 → InstallPage (publik)
/                        → DashboardPage (skyddad, DashboardLayout)
  ├── /agents            → AgentsListPage
  ├── /agents/:slug      → AgentDetailPage
  ├── /approvals         → ApprovalsPage
  ├── /triggers          → TriggersPage
  ├── /triggers/config   → TriggersConfigPage (nytt i 0.5.2)
  ├── /calendar          → CalendarPage
  ├── /activity          → ActivityPage
  ├── /settings          → SettingsPage
  └── /costs             → CostsPage
*                        → NotFound (404)
```

`ProtectedRoute`-wrapper kontrollerar auth-status och omdirigerar till `/login`. Användare med roll `nobody` ser `NoAccessPage`.

#### State management

**Tre lager:**

1. **Server state (TanStack React Query):** Alla API-anrop via `useQuery`/`useMutation` med automatisk caching (`staleTime: 5000`). Query keys: `['agents']`, `['tasks', agentId]`, etc.
2. **React Context:** `AuthContext` (user, isAuthenticated, login/signup/logout) + `ThemeContext` (färg + mörkt/ljust, persisterat till localStorage + Supabase profile).
3. **Realtidssync (`useRealtimeSync`):** Prenumererar på Supabase PostgreSQL Changes för tabeller: `agents`, `tasks`, `activity_log`, `approvals`, `commands`, `feedback`, `system_settings`. Vid dataändring invalideras motsvarande React Query-cache → automatisk re-render.

#### PWA-konfiguration

- Service worker med auto-update (Vite PWA-plugin)
- Manifest: "FIA Dashboard", tema `#FF6B0B`
- Ikoner: 192×192 + 512×512 SVG
- Offline-stöd via Workbox (caching av Supabase-anrop)

#### Temasystem

5 färgscheman (plum, forest, slate, sienna, stone) × 2 lägen (light, dark) = 10 kombinationer. HSL-baserade CSS-variabler. Persisteras till localStorage + `profiles.theme` i Supabase.

---

## Task Queue

In-memory prioritetskö med konfigurerbar max-concurrency.

| Egenskap          | Värde                                                               |
| ----------------- | ------------------------------------------------------------------- |
| Max concurrent    | 3 (env: `QUEUE_MAX_CONCURRENCY`)                                    |
| Prioritetsordning | urgent (0) → high (1) → normal (2) → low (3)                        |
| Status            | queued, running, completed, failed                                  |
| Persistence       | Ingen (in-memory). Föräldralösa tasks markeras `error` vid startup. |

Funktioner:

- Pausa/återuppta från Slack eller API
- Progress-callback → Slack + activity_log
- Recovery vid startup: `in_progress`-tasks utan ägare markeras som `error`

---

## Schemalagda uppgifter (dynamisk)

Cron-jobb lagras i `scheduled_jobs`-tabellen och hanteras via DynamicScheduler. CRUD-operationer via Dashboard, CLI och Slack triggar scheduler-reload automatiskt via `update_schedule`-command.

**Default-jobb (seedade via migration 014):**

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

**Hantering – triple-interface:**

| Gränssnitt | Skapa                                            | Redigera              | Ta bort                 | Aktivera/Inaktivera             |
| ---------- | ------------------------------------------------ | --------------------- | ----------------------- | ------------------------------- |
| Dashboard  | SchedulerSection (visuell cron-editor)           | ✓                     | ✓                       | ✓                               |
| CLI        | `fia cron create --agent ... --cron ...`         | `fia cron edit <id>`  | `fia cron delete <id>`  | `fia cron enable/disable <id>`  |
| Slack      | `/fia cron create <agent> <type> <cron> <titel>` | `/fia cron edit <id>` | `/fia cron delete <id>` | `/fia cron enable/disable <id>` |

Alla schemalagda tasks respekterar kill switch och agent-pausstatus. Delad affärslogik i `src/shared/cron-service.ts`.

---

## Slack-kommandon

| Kommando                                                | Beskrivning                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `/fia status`                                           | Systemstatus (agenter, kill switch, kö, scheduler)               |
| `/fia kill`                                             | Aktivera kill switch                                             |
| `/fia resume`                                           | Avaktivera kill switch                                           |
| `/fia run <agent> <task>`                               | Manuell trigger av agent                                         |
| `/fia approve <task-id>`                                | Godkänn uppgift                                                  |
| `/fia reject <task-id>`                                 | Avslå uppgift                                                    |
| `/fia queue`                                            | Visa köade uppgifter                                             |
| `/fia triggers`                                         | Lista pending triggers som väntar på godkännande                 |
| `/fia triggers approve <id>`                            | Godkänn pending trigger → skapar downstream task                 |
| `/fia triggers reject <id> <reason>`                    | Avslå pending trigger                                            |
| `/fia cron`                                             | Lista alla schemalagda cron-jobb                                 |
| `/fia cron create <agent> <type> <cron 5 fält> <titel>` | Skapa nytt cron-jobb                                             |
| `/fia cron edit <id> <fält>=<värde>`                    | Redigera cron-jobb                                               |
| `/fia cron delete <id>`                                 | Ta bort cron-jobb                                                |
| `/fia cron enable\|disable <id>`                        | Aktivera/inaktivera cron-jobb                                    |
| `/fia lineage <task-id>`                                | Visa task-träd: ancestors, current, children                     |
| `/fia purge`                                            | Rensa föräldralösa tasks                                         |
| `/fia help`                                             | Visa alla kommandon, agenter, uppgiftstyper och schemalagda jobb |

**Auto-notiser (gateway → Slack):**

- `notify_slack`-triggers: postar till konfigurerad kanal via Bolt (t.ex. `#fia-orchestrator`, `#fia-logs`)
- `requires_approval`-triggers: postar till `#fia-orchestrator` med kort ID och `/fia triggers approve`-kommando

Slack-kanaler:

| Kanal               | Innehåll                                        |
| ------------------- | ----------------------------------------------- |
| `#fia-content`      | Content Agent progress                          |
| `#fia-campaigns`    | Campaign Agent progress                         |
| `#fia-analytics`    | Analytics Agent progress                        |
| `#fia-intelligence` | Intelligence Agent progress                     |
| `#fia-orchestrator` | Strategy/Lead/Brand/SEO progress + eskaleringar |

---

## FIA CLI

Terminalverktyg som pratar med gatewayens REST API (port 3001) och Supabase direkt (för cron-hantering). Tredje gränssnittet efter Slack och Dashboard. Lever i `cli/` i samma repo, delar `.env` och TypeScript-konfiguration.

**Auth:** `FIA_CLI_TOKEN` i `.env` – enkel bearer token som bypaschar Supabase JWT (admin-roll).

**Beroenden:** Commander, chalk@4 (CJS), boxen@5 (CJS), ora@5 (CJS), cli-table3.

### CLI-kommandon

| Kommando                                             | Beskrivning                                           |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `fia`                                                | Visa FIA-banner                                       |
| `fia status`                                         | Systemöversikt (kill switch, kö, agenter)             |
| `fia agents [slug]`                                  | Agenttabell eller detaljvy per agent                  |
| `fia run <agent> <task> [--priority]`                | Trigga task manuellt (spinner + polling)              |
| `fia queue [--verbose]`                              | Köade och pågående tasks                              |
| `fia approve <task-id> [--feedback]`                 | Godkänn task (accepterar korta ID:n)                  |
| `fia reject <task-id> --feedback`                    | Avslå task (feedback obligatoriskt)                   |
| `fia kill [--force]`                                 | Aktivera kill switch (bekräftelse krävs)              |
| `fia resume`                                         | Avaktivera kill switch                                |
| `fia logs [--agent] [--action]`                      | Aktivitetslogg (senaste 10 default)                   |
| `fia tail [--agent]`                                 | Live-stream av aktivitet (Supabase Realtime)          |
| `fia watch`                                          | Mini-dashboard (2s refresh) + pending trigger-räknare |
| `fia config [agent] [--routing]`                     | Visa/redigera agentkonfiguration                      |
| `fia triggers [--agent] [--status]`                  | Pending trigger-kö (approve/reject-lista)             |
| `fia triggers approve <id> [--feedback]`             | Godkänn pending trigger → skapar downstream task      |
| `fia triggers reject <id> --reason`                  | Avslå pending trigger                                 |
| `fia triggers config [agent] [--enable/--disable]`   | Visa/växla trigger-konfiguration per agent            |
| `fia triggers reseed [agent] [--confirm]`            | Dry-run diff + reseed triggers från agent.yaml        |
| `fia cron [--agent]`                                 | Lista alla schemalagda cron-jobb                      |
| `fia cron create --agent --cron --task-type --title` | Skapa nytt cron-jobb                                  |
| `fia cron edit <id> [--cron] [--title] [--priority]` | Redigera cron-jobb                                    |
| `fia cron delete <id> [--yes]`                       | Ta bort cron-jobb (bekräftelse krävs)                 |
| `fia cron enable/disable <id>`                       | Aktivera/inaktivera cron-jobb                         |
| `fia lineage <task-id>`                              | ASCII-träd: ancestors → current → children            |

### Filstruktur

```
cli/
├── index.ts              # Commander setup, banner vid tomt kommando (v0.5.3)
├── commands/             # Ett kommando per fil (14 st + helpers)
│   ├── status.ts         # fia status
│   ├── agents.ts         # fia agents [slug]
│   ├── run.ts            # fia run (POST + polling)
│   ├── queue.ts          # fia queue
│   ├── approve.ts        # fia approve
│   ├── reject.ts         # fia reject
│   ├── kill.ts           # fia kill (med readline-bekräftelse)
│   ├── resume.ts         # fia resume
│   ├── logs.ts           # fia logs
│   ├── tail.ts           # fia tail (Supabase Realtime)
│   ├── watch.ts          # fia watch (terminal-dashboard + trigger-räknare)
│   ├── config.ts         # fia config
│   ├── triggers.ts       # fia triggers (list/approve/reject/config/reseed)
│   ├── cron.ts           # fia cron (list/create/edit/delete/enable/disable)
│   ├── lineage.ts        # fia lineage (task-träd)
│   └── helpers.ts        # resolveTaskId (kort → fullt UUID)
├── lib/
│   ├── api-client.ts     # HTTP-klient (native fetch, Bearer token)
│   ├── formatters.ts     # Earth-palett, tabeller, boxen, relativeTime
│   ├── realtime.ts       # Supabase Realtime (activity_log INSERT)
│   ├── supabase.ts       # Cachad Supabase-klient (för cron CRUD)
│   └── config.ts         # .env-läsare (dotenv)
└── types.ts              # CLI-typer + re-export
```

---

## FIA Display Status

Gemensam standard för alla tre gränssnitt (CLI, Dashboard, Slack). Implementerad i `src/shared/display-status.ts`.

### De fem statusarna

| Displaystatus | Färg  | Symbol | Betydelse                        |
| ------------- | ----- | ------ | -------------------------------- |
| online        | Grön  | ●      | Uppe, lyssnar, redo att ta tasks |
| working       | Gul   | ●      | Exekverar minst en task just nu  |
| paused        | Grå   | ●      | Pausad av orchestrator           |
| killed        | Svart | ⬤      | Kill switch aktiv                |
| error         | Röd   | ✗      | Agent i error-state              |

### Resolve-logik (prioritetsordning)

1. Kill switch aktiv → `killed`
2. `agent.status === 'error'` → `error`
3. `agent.status === 'paused'` → `paused`
4. Agent har pågående task → `working`
5. Annars → `online`

### Mappning per gränssnitt

| Gränssnitt | Färgformat          | Källa                   |
| ---------- | ------------------- | ----------------------- |
| CLI        | chalk.hex() / chalk | `cli/lib/formatters.ts` |
| Dashboard  | Tailwind-klasser    | Frontend-repo           |
| Slack      | Slack-emojis        | `src/slack/commands.ts` |

---

## Strukturerad output (tool_use)

Claude API:s tool_use används för att få strukturerad output från agenter. Fyra verktyg definierade:

| Verktyg                 | Agent                   | Syfte                                                                                           |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `content_response`      | Content, Campaign, Lead | Strukturerad content-output (title, body, summary, metadata)                                    |
| `brand_review_decision` | Brand                   | Strukturerat granskningsbeslut (approved/rejected, feedback, scores)                            |
| `signal_scoring`        | Intelligence            | Strukturerad signalscoring (domain_relevance, forefront_impact, actionability, recency_novelty) |
| `deep_analysis`         | Intelligence            | Strukturerad djupanalys (summary, implications, suggested_action, confidence)                   |

---

## GCP-hosting

### Varför GCP

Google-ekosystem (Gemini, gws, Workspace), EU-region (europe-north1), IAM, skalbarhet (CE → Cloud Run → GKE).

### Compute Engine

- Instans: `fia-gateway`, e2-small (2 vCPU, 2 GB RAM)
- Region: europe-north1-b (Finland, EU)
- OS: Ubuntu 24 LTS, 20 GB SSD
- Kostnad: ~$15–25/mån
- Firewall: Enbart utgående. SSH via IAP.

### IAM

```
GCP-projekt: ffcg-fia
├── SA: fia-gateway@ffcg-fia.iam.gserviceaccount.com
│   ├── roles/aiplatform.user
│   ├── roles/compute.instanceAdmin
│   └── roles/logging.logWriter
└── SA: fia-gws@ffcg-fia.iam.gserviceaccount.com
    └── Domain-Wide Delegation → impersonerar fia@forefront.se
```

---

## Varumärkeskontext

Se `knowledge/brand/` för komplett varumärkesplattform (platform.md, tonality.md, visual.md, messages.md). Sammanfattning:

- **Ton:** Klok kollega – konkret, nyfiken, aktiv röst
- **Färger (Earth):** `#7D5365`, `#42504E`, `#555977`, `#756256`, `#7E7C83`
- **Gradient:** `#FF6B0B` → `#FFB7F8` → `#79F2FB`
- **Typsnitt:** Manrope

---

## Säkerhet och governance

- API-nycklar i `.env`, aldrig i kod
- GCP IAM med Service Accounts per tjänst
- Gateway exponeras INTE mot internet (Socket Mode, IAP)
- Dashboard-kommandon via `commands`-tabell – aldrig direkt
- Minsta möjliga rättighet per agent/MCP/gws-tjänst
- Kill switch: dual (Slack + Dashboard) med audit trail
- RLS på alla Supabase-tabeller
- Supabase Auth (JWT), inga API-nycklar i frontend
- Inbjudningsbaserad registrering
- All data inom EU (GCP europe-north1 + Supabase EU)
- Strukturerad loggning med audit trail
- Veckovis logg-review, månadsvis varumärkesaudit
- Zod-validering av all konfiguration och API-input

---

## Content Staging (fas 2)

### Princip

Orchestrator ska kunna läsa och bedöma allt content direkt i dashboarden utan att öppna externa verktyg. En universell staging-vy renderar content oavsett kanal, med kanalspecifika previews som tillägg.

### Gateway: Output-validering

Alla innehållsproducerande agenter (Content, Campaign, SEO, Lead vid nurture) skriver till `tasks.content_json` enligt det standardiserade schemat. Gateway validerar output via Zod-schema efter varje content-genererande task. Agenter som missar obligatoriska fält får tasken markerad med status: `error` och en tydlig felbeskrivning i `content_json.validation_errors`.

Obligatoriska fält: `content_type`, `title`, `body` (markdown), `summary`. Valfria fält: `media[]`, `channel_hints`, `metadata`.

### Dashboard: Staging-vy

Tvåkolumnslayout i godkännandekön:

- **Vänster kolumn:** Renderad markdown-preview av `body` med bilder inladdade från `media[].url` (Google Drive). Universell vy som alltid fungerar oavsett `content_type`.
- **Höger kolumn:** Kanalspecifik preview baserad på `content_type`:
  - **LinkedIn-post:** Hook line, brödtext med teckengräns-visualisering, hashtaggar
  - **E-post/nyhetsbrev:** Subject line + preheader i inbox-liknande vy, body
  - **Blogg:** Title, hero image, body med SEO-metadata (keywords, reading_time)

### Bildhantering

Bilder refereras via Google Drive-URL:er i `media[]`. Dashboarden laddar in dessa som thumbnails i staging-vyn. Ingen bildstorage i Supabase – Drive är redan mediet.

---

## Feedback-loop (fas 3)

### Princip

Orchestrators bedömning av agent-output styr agenternas beteende över tid. Feedback skapar en självreglerande kvalitetsloop: bra agenter får mer autonomi, dåliga agenter får mer granskning.

### Rating-dimensioner

| Dimension   | Vad den mäter                             |
| ----------- | ----------------------------------------- |
| tonality    | Följer tonalitetsregler och karaktärsdrag |
| accuracy    | Faktakorrekthet, inga hallucinationer     |
| clarity     | Tydlighet, struktur, läsbarhet            |
| brand_fit   | Varumärkeskonsistens, budskapshierarki    |
| channel_fit | Passar kanalen (längd, format, CTA)       |

### Gateway: Feedback-summary-generering

Gateway genererar periodiskt (veckovis eller vid 10+ nya feedback-rader) en `feedback-summary.json` per agent i `memory/`-katalogen.

```json
{
  "period": "2026-W11",
  "tasks_reviewed": 14,
  "avg_overall": 3.8,
  "dimension_averages": {
    "tonality": 4.1,
    "accuracy": 4.5,
    "clarity": 3.2,
    "brand_fit": 3.9,
    "channel_fit": 4.0
  },
  "top_issues": ["Texterna tenderar att bli för långa och akademiska", "Saknar tydlig CTA i LinkedIn-poster"],
  "exemplary_tasks": ["task-uuid-1", "task-uuid-2"]
}
```

### Dynamisk sample_review_rate

| Snittbetyg (20+ tasks) | Effekt                                         |
| ---------------------- | ---------------------------------------------- |
| ≥ 4.0                  | `sample_review_rate` sänks (min 0.1)           |
| 3.0–3.9                | Ingen ändring                                  |
| 2.5–2.9                | `sample_review_rate` höjs (max 1.0)            |
| < 2.5                  | Flaggas för manuell intervention, agent pausas |

Tröskelvärdena konfigureras i `system_settings` (nyckel: `feedback_thresholds`).

### Fas 3-utökning: Few-shot "avoid"-exempel

Tasks med betyg 1-2 och kommentarer extraheras automatiskt som negativa few-shot-exempel i agentens `context/few-shot/`-katalog (t.ex. `avoid-001.md`).

---

## Roadmap

### Fas 0–1: Genomförd

Deploy 0.2 (2026-03-15). Gateway + Dashboard MVP live. 4 arbetsdagar, en person med Claude Code + Lovable.

### Deploy 0.5 (2026-03-22): CLI + Display Status

- FIA CLI-klient med 11 kommandon, Forefront Earth-palett, Supabase Realtime
- FIA Display Status – gemensam standard (online/working/paused/killed/error)
- CLI auth middleware (FIA_CLI_TOKEN-bypass)
- POST /api/tasks endpoint, kommaseparerade status-filter
- Teknisk skuld B1–B12 åtgärdad, gws MCP kopplad, CI/CD + ESLint + Prettier

### Deploy 0.5.1 (2026-03-23): Task Status & Trigger Engine

- Utökad statusmodell: 17 statusar (10 nya) med statusmaskin och övergångsvalidering
- Deklarativ trigger engine: 7 triggers i 4 agenter (Intelligence, Strategy, Analytics, SEO)
- pending_triggers-tabell med godkännandekö i Dashboard
- Task-relationer: parent_task_id, children, lineage
- Dashboard: TaskStatusBadge, TriggersPage, task-relationer i TaskDetailSheet
- API: trigger CRUD, task status/children/lineage endpoints
- Migration 013

### Deploy 0.5.2 (2026-03-23): Trigger Configuration

- Trigger-konfiguration i dashboard + CLI + Slack
- Trigger engine läser från config_json (Supabase) istället för agent.yaml
- Reseed från YAML: dry-run diff + bekräftelsedialog
- 4 nya API-endpoints, 11 nya React-komponenter

### Deploy 0.5.3 (2026-03-24): Cron Job Management

- **Triple-interface komplett för cron-jobb:** Dashboard + CLI + Slack har likvärdig CRUD
- Delad cron-service (`src/shared/cron-service.ts`) med validering och `update_schedule`-command
- `fia cron` CLI-kommando: list, create, edit, delete, enable, disable
- `/fia cron` Slack-kommandon: samma CRUD
- CLI Supabase-klient (`cli/lib/supabase.ts`) för direkt DB-åtkomst
- Scheduler hot reload vid alla mutationer (Dashboard, CLI, Slack)
- Korrigerar arkitekturen: de 10 default-jobben lever nu som dynamiska rader, inte hårdkodade

### Nästa steg – Fas 1 avslut

| #   | Uppgift                 | Beskrivning                                                                                                                                                                          | Prioritet |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1   | **10 innehållsenheter** | Kör Content Agent med verkliga tasks (blog_post, linkedin, newsletter). Verifiera end-to-end: trigger → LLM → Brand review → godkänn → activity_log. Via `fia run content blog_post` | Hög       |
| 2   | **Go/no-go checkpoint** | Granska de 10 enheterna mot tonalitetsregler och varumärkesplattform. Kriterium: 80% publiceringsredo                                                                                | Hög       |
| 3   | Gemini context caching  | Minskar kostnader vid upprepade system_context-anrop. Kan skjutas till Fas 2                                                                                                         | Valfritt  |
| 4   | GA4 Analytics API       | Analytics Agent klarar sig utan i MVP. Kan skjutas till Fas 2                                                                                                                        | Valfritt  |

### Fas 2: Expansion + Content Staging

- Agenter kopplade till externa system (Strategy, Campaign, SEO, Lead, Analytics)
- MCP-wrappers: LinkedIn, HubSpot, Buffer (`src/mcp/`)
- Första agentdrivna kampanjen
- Content Staging:
  - Standardiserat `content_json`-schema i gateway (Zod-validering)
  - Output-validering för alla content-producerande agenter
  - Dashboard: staging-vy med markdown-preview + kanalspecifika previews
  - Bildhantering via Google Drive-URL:er i `media[]`
- Go/no-go: Kampanj i paritet

### Fas 3: Optimering + Feedback

- Promptoptimering, ökad autonomi, kostnadsoptimering, ROI
- Feedback & Agentoptimering:
  - Dashboard: rating-UI + trendgrafer i agentdetalj
  - Gateway: `feedback-summary.json` per agent i `system_context`
  - Dynamisk `sample_review_rate`
  - Few-shot "avoid"-exempel

### Fas 4: Full drift

- Dokumentation, SLA:er, backup-Orchestrator, kundcase

---

---

## Beroenden (package.json)

### Produktion

| Paket                   | Version | Syfte                                        |
| ----------------------- | ------- | -------------------------------------------- |
| `@anthropic-ai/sdk`     | ^0.39.0 | Claude API (Opus 4.6 + Sonnet 4.6)           |
| `@google/genai`         | ^1.0.0  | Gemini API (textgenerering + bildgenerering) |
| `@slack/bolt`           | ^4.1.0  | Slack SDK (Socket Mode)                      |
| `@supabase/supabase-js` | ^2.49.0 | Supabase-klient                              |
| `express`               | ^4.21.0 | REST API (internt)                           |
| `node-cron`             | ^3.0.3  | Schemaläggning                               |
| `yaml`                  | ^2.7.0  | Parsning av agent.yaml                       |
| `zod`                   | ^4.3.6  | Validering                                   |
| `uuid`                  | ^11.1.0 | Task-ID:n                                    |
| `dotenv`                | ^16.4.7 | Miljövariabler                               |
| `commander`             | ^12.1.0 | CLI-ramverk (FIA CLI)                        |
| `chalk`                 | ^4.1.2  | CLI-färger (CJS-kompatibel)                  |
| `boxen`                 | ^5.1.2  | CLI-boxar (CJS-kompatibel)                   |
| `ora`                   | ^5.4.1  | CLI-spinners (CJS-kompatibel)                |
| `cli-table3`            | ^0.6.4  | CLI-tabeller                                 |

### Utveckling

| Paket              | Version           | Syfte                    |
| ------------------ | ----------------- | ------------------------ |
| `typescript`       | ^5.9.3            | Kompilator (strict mode) |
| `ts-node`          | ^10.9.2           | Direkt TS-exekvering     |
| `jest` + `ts-jest` | ^29.7.0 / ^29.3.0 | Testramverk              |
| `nodemon`          | ^3.1.0            | Dev watch mode           |

---

## Miljövariabler

Se `.env.example` för alla nyckelnamn. Aldrig i kod. Kritiska:

```
ANTHROPIC_API_KEY          # Claude API (krävs)
GEMINI_API_KEY             # Gemini API – text + bild (valfritt)
SERPER_API_KEY             # Google Search via Serper (valfritt)
SLACK_BOT_TOKEN            # Slack
SLACK_APP_TOKEN            # Slack Socket Mode
SLACK_SIGNING_SECRET       # Webhook-validering
SUPABASE_URL               # EU-region
SUPABASE_SERVICE_ROLE_KEY  # Gateway-skrivningar
SUPABASE_ANON_KEY          # Dashboard-läsning
NODE_ENV                   # production | development
LOG_LEVEL                  # debug | info | warn | error
KNOWLEDGE_DIR              # ./knowledge (källa till sanning)
GATEWAY_API_PORT           # 3001 (internt)
QUEUE_MAX_CONCURRENCY      # 3 (default)
USD_TO_SEK                 # 10.5 (växelkurs)
```
