# FIA – Forefront Intelligent Automation

**Master-dokument.** All arkitektur, alla agentdefinitioner, datamodell, API-kontrakt, roadmap och principer lever här. Gateway- och Dashboard-filerna pekar hit.

**Version:** 0.3.0
**Senast uppdaterad:** 2026-03-19

---

## Bakgrund: varför vi landar här

Vi utvärderade tre ansatser:

| Ansats | Styrkor | Svagheter |
|--------|---------|-----------|
| **Perplexity Computer** | Multi-modell-orkestrering (19 LLM:er), molnbaserat | Svart låda, ingen kontroll över promptar/varumärkeskontext, $200/mån, designat för ad hoc – inte always-on drift |
| **OpenClaw** | Rätt mönster (persistent agent, skill-baserat, heartbeats, meddelandegränssnitt) | Skaparen lämnat projektet, 512 säkerhetshål (8 kritiska), omoget |
| **Claude Code Agent Teams** | Stark multi-agent-koordinering | Sessionsbaserat, saknar persistence och schemaläggning |

**Slutsatsen:** Egen tunn gateway – inspirerad av OpenClaws mönster, med Claude Opus 4.6 som orkestrerande huvud-LLM, multi-modell-routing, och full kontroll över varumärkeskontext, guardrails och säkerhet.

---

## Nuläge (2026-03-19)

### Övergripande status

| Delsystem | Status | Deploy |
|-----------|--------|--------|
| Gateway (backend) | Solid MVP, alla 7 agenter live | 0.2 (2026-03-15) |
| Dashboard (frontend) | Robust MVP, strict TS, error boundaries, tester | Live på Lovable |
| Supabase (DB) | 10 tabeller, RLS, Realtime | EU-region aktiv |
| GCP (hosting) | Compute Engine konfigurerad | europe-north1-b |
| Slack | Bolt SDK + Socket Mode live | Aktiv |
| MCP-integrationer | gws konfigurerad, ej kopplad | Fas 2 |

### Backend – Gateway (Ambivrt/FIA)

**Kodbas:** ~47 TypeScript-filer, ~3 000 LOC, TypeScript strict mode, 15 testfiler.

| Komponent | Status |
|-----------|--------|
| Gateway-kärna (scheduler, router, task queue, logger) | Klar |
| Alla 7 agenter (Content, Brand, Strategy, Campaign, SEO, Lead, Analytics) | Klar |
| LLM-klienter (Claude Opus/Sonnet, Nano Banana 2, Serper) | Klar |
| Modell-router (manifest-driven via agent.yaml) | Klar |
| Skill-system (shared: + agent:) | Klar |
| Slack-integration (Bolt SDK, 6+ kommandon) | Klar |
| Supabase-klient (heartbeats, tasks, realtime-lyssnare) | Klar |
| REST API (Express, JWT-auth, Zod-validering) | Klar |
| Kill switch (dual: Slack + Dashboard) | Klar |
| Kostnadsberäkning (tokens → USD → SEK) | Klar |
| Task recovery vid startup | Klar |
| Testsvit (router, brand-agent, agent-loader, content-agent, m.fl.) | Klar |
| MCP-wrappers (HubSpot, LinkedIn, Buffer) | **Ej påbörjat** |
| gws MCP kopplad till agenter | **Konfigurerad, ej kopplad** |
| Content staging (Zod-validering av content_json) | **Fas 2** |
| Feedback-loop (feedback-summary, dynamisk review rate) | **Fas 3** |
| CI/CD (GitHub Actions) | Klar (`.github/workflows/ci.yml`) |
| ESLint/Prettier | Klar (`eslint.config.mjs`, `.prettierrc`) |
| Teknisk skuld B1–B12 | **Åtgärdad** (2026-03-19) |

### Frontend – Dashboard PWA (Ambivrt/fia-frontend)

**Kodbas:** React 18.3 + Vite 5.4 + TypeScript 5.8 (strict: true), Tailwind 3.4 + shadcn/ui, TanStack React Query 5.83, 13 sidor, 19+ komponenter, 60+ API-funktioner.

| Komponent | Status |
|-----------|--------|
| Auth (Supabase, login/signup, rollhantering) | Klar |
| Agentöversikt med puls/status/heartbeat | Klar |
| Godkännandekö (approve/reject/revision + dual-write audit) | Klar |
| Kill switch (toggle + realtidsuppdatering) | Klar |
| Aktivitetslogg med paginering (20/sida) | Klar |
| Realtime-sync via Supabase PostgreSQL Changes | Klar |
| i18n (svenska + engelska, 409 rader per språk) | Klar |
| Teman (5 färgscheman × ljust/mörkt, persisterat) | Klar |
| PWA-stöd (service worker, manifest, offline caching) | Klar |
| Kostnadssida med KPI-kort | Klar |
| Kalendervy + schemalagda jobb | Klar |
| Inställningar (profiler, roller, schemalagda jobb) | Klar |
| Responsiv design med mobil bottom-nav | Klar |
| Sökfunktion (Command Palette, Cmd+K) | Klar |
| Notifikationssystem (bell med pending count badge) | Klar |
| Error boundaries (app-level + granulär) | Klar |
| Testsvit (ErrorBoundary, status-utils, computeKpi) | Klar |
| ARIA-labels på alla icon-knappar | Klar |
| Task-paginering (prev/next) | Klar |
| Teknisk skuld F1–F10 | **Åtgärdad** (2026-03-19) |
| Content staging / preview | **Fas 2** |
| Feedback-UI / rating | **Fas 3** |

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
│                │  │  feedback, system_settings       │
└────────────────┘  └───────────────┬──────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      FIA Dashboard (PWA)       │
                    │  React · Vite · TypeScript     │
                    │  Tailwind · shadcn/ui          │
                    │  fia.forefront.se              │
                    └───────────────────────────────┘
```

**Dual-interface:** Slack och Dashboard fungerar parallellt. Gateway är källan till sanning – skriver agentdata till Supabase, dashboarden läser via Supabase Realtime. Kommandon (pausa, godkänn, kill switch) kan ges via båda gränssnitten.

---

## LLM-modeller (multi-modell-routing)

| Modell | Model ID | Användning i FIA | Pris (per 1M tokens) |
|--------|----------|-------------------|----------------------|
| Claude Opus 4.6 | `claude-opus-4-6` | Orkestrerande huvud-LLM: strategi, komplex analys, varumärkesgranskning (Brand Agent), högrisk-innehåll, blogg, kampanjstrategi | $15 in / $75 ut |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Metadata, alt-texter, A/B-varianter, lead scoring, klassificering, nurture-sekvenser, rapporter | $3 in / $15 ut |
| Nano Banana 2 | `gemini-2.5-flash-image` | Bildgenerering: social media-grafik, blogg-illustrationer, annonskreativ | ~$0.04/bild |
| Serper.dev | `google-custom-search` | Realtidssökning: omvärldsbevakning, trendspaning, SEO-analys, faktakontroll | $0.001/sökning |

### Routinglogik

Varje agents `agent.yaml` definierar ett `routing`-fält som mappar uppgiftstyp → modellalias. Gatewayen läser detta vid laddning – ingen hårdkodning av modellval i kod.

**Giltiga modellalias:** `claude-opus`, `claude-sonnet`, `nano-banana-2`, `google-search`.

Modellaliasens mappning till API-modell-ID:

```typescript
const MODEL_MAP = {
  "claude-opus":    "claude-opus-4-6",
  "claude-sonnet":  "claude-sonnet-4-6",
  "nano-banana-2":  "gemini-2.5-flash-image",
  "google-search":  "google-custom-search",  // Serper API
};
```

`google-search` implementeras via Serper.dev API (Google Custom Search är stängt för nya kunder sedan januari 2026).

---

## Gateway-komponenttabell

| Komponent | Teknik | Syfte |
|-----------|--------|-------|
| Runtime | Node.js ≥20 LTS (PM2) | Always-on daemon |
| Språk | TypeScript (strict mode) | Typsäkerhet |
| Scheduler | node-cron | Tidsbaserade triggers (7 cron-jobb) |
| Task Queue | In-memory prioritetskö | Max 3 concurrent, prioritetsordning (urgent → low) |
| Slack | Bolt SDK (Socket Mode) | Orchestrator-gränssnitt |
| Modell-router | Manifest-driven (agent.yaml) | Dirigerar uppgifter till rätt LLM |
| LLM | Anthropic SDK (`@anthropic-ai/sdk`) | Claude Opus 4.6 / Sonnet 4.6 (tool_use för strukturerad output) |
| Bildgenerering | Google GenAI SDK (`@google/genai`) | Nano Banana 2 via Gemini API |
| Sökning | Serper.dev API | Realtidsdata (Googles sökresultat) |
| Kontexthantering | agent.yaml + markdown + JSON | system_context, task_context per agent |
| Skill-system | Modulärt (shared: + agent:) | 6 delade skills + agentspecifika skills |
| Loggning | Strukturerad JSON → Supabase | Audit trail |
| Databas-klient | `@supabase/supabase-js` | Heartbeats, tasks, metrics, activity_log |
| Realtime-lyssnare | Supabase Realtime | Kommandon + task-uppdateringar från Dashboard |
| REST API | Express (intern, port 3001) | Dashboard-kommandon via Edge Functions |
| Validering | Zod | Config-validering, API-inputvalidering |
| Google Workspace | gws CLI v0.4.4 via MCP | Drive, Gmail, Calendar, Sheets, Docs |
| Hosting | GCP Compute Engine (europe-north1-b) | EU, GDPR |

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

| System | Integration | Status |
|--------|-------------|--------|
| Google Workspace | gws CLI (MCP-server) | Klar – fas 1 |
| — Gmail, Calendar, Drive, Sheets, Docs | via `gws mcp -s` | Klar – fas 1 |
| — GA4 | Direkt API (`analyticsdata.googleapis.com`) | Fas 2 |
| Slack | Bolt SDK (Socket Mode) | Klar |
| HubSpot | Community MCP | Valideras fas 2 |
| LinkedIn | Custom MCP-wrapper | Fas 2 |
| Buffer | Custom MCP-wrapper | Fas 2 |

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

| Skill | Slug | Används av |
|-------|------|-----------|
| Forefront Identity | `forefront-identity` | Alla 7 agenter |
| Brand Compliance | `brand-compliance` | Content, Brand, Campaign, Lead, Strategy |
| Swedish Tone | `swedish-tone` | Content, Campaign |
| Data-Driven Reasoning | `data-driven-reasoning` | Strategy, Campaign, SEO, Analytics |
| Escalation Protocol | `escalation-protocol` | Alla 7 agenter |
| GDPR Compliance | `gdpr-compliance` | Lead, Analytics |

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

skills:                    # Modulärt skill-system (nytt i v1.1.0)
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

system_context:            # Alltid i systemprompt
  - context/tone-examples.md

task_context:              # On-demand per uppgiftstyp
  blog_post:
    - context/templates/blog-post.md
    - context/few-shot/blog-good.md

tools:                     # MCP-servrar och gws-tjänster
  - gws:drive
  - gws:docs

autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.2

writable:                  # Filer agenten får skriva till
  - memory/learnings.json
```

---

## Agentkluster – alla sju

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

### Autonominivåer per innehållstyp

| Typ | Autonomi | Stickprov |
|-----|----------|-----------|
| Social media (organiskt) | Full autonom | 1 av 5 |
| Blogginlägg | Autonom + Brand Agent | 1 av 3 |
| Nyhetsbrev | Autonom + Brand Agent + Orchestrator | Alla |
| Kundcase / pressrelease | Semi-autonom, Orchestrator godkänner | Alla |

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
  status text NOT NULL DEFAULT 'queued',           -- queued | in_progress | awaiting_review | approved | rejected | published | error
  priority text NOT NULL DEFAULT 'normal',
  content_json jsonb,
  model_used text,
  tokens_used integer,
  cost_sek numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
```

Notering: `error`-status tillagd i migration 003. Tasks med status `error` skapas vid LLM-fel eller vid startup-recovery av föräldralösa tasks.

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
  command_type text NOT NULL,                      -- pause_agent | resume_agent | approve_task | reject_task | revision_task | kill_switch | update_config
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

Notering: Hanterar dashboard-baserad schemaläggning. Gateway har egen node-cron med fasta 7 jobb (se "Schemalagda uppgifter"). Tabellen möjliggör framtida dynamisk schemaläggning via Dashboard.

### Migrationer

| # | Fil | Beskrivning |
|---|-----|-------------|
| 001 | `001_initial_schema.sql` | Komplett schema med 6 tabeller + RLS |
| 002 | `002_remove_task_type_check.sql` | Tog bort rigid type-enum (`agent.yaml` är källa) |
| 003 | `003_add_error_status.sql` | Lade till `error` i task status-constraint |
| 004 | `004_add_source_and_metrics_constraint.sql` | `source`-fält på tasks, metrics-constraint |
| 005 | `005_fix_metrics_constraint.sql` | Fixade metrics-constraint |
| 006 | `006_add_update_task_status_fn.sql` | RPC-funktion `update_task_status()` |
| 007 | `007_drop_cost_ledger_trigger.sql` | Droppade `cost_ledger`-tabell och trigger |

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

-- Commands UPDATE: Gateway via service role key
```

### Realtid-prenumerationer

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE agents, tasks, activity_log, commands, system_settings, feedback;
```

---

## REST API-kontrakt (MASTER)

### Autentisering

Alla anrop kräver `Authorization: Bearer <supabase-jwt>`. API:t validerar token mot Supabase Auth och hämtar roll från `profiles`.

### Felformat

```json
{ "error": { "code": "FORBIDDEN", "message": "Rollen 'viewer' har inte behörighet." } }
```

Statuskoder: 200, 201, 400, 401, 403, 404, 500.

### Agenter

- `GET /api/agents` – Alla inloggade. Returnerar alla sju med status, heartbeat, routing, tools, uppgiftsräknare.
- `GET /api/agents/:slug` – Alla inloggade. Utökad info inkl. `config_json`.
- `POST /api/agents/:slug/pause` – Orchestrator, Admin. Skriver till `commands`.
- `POST /api/agents/:slug/resume` – Orchestrator, Admin. Skriver till `commands`.
- `PUT /api/agents/:slug/config` – Admin. Body: `{ "config_json": { ... } }`

### Uppgifter

- `GET /api/tasks` – Alla inloggade. Query: `status`, `agent_slug`, `type`, `priority`, `page`, `per_page`, `sort`.
- `GET /api/tasks/:id` – Alla inloggade. Med `content_json` och `approvals`.
- `POST /api/tasks/:id/approve` – Orchestrator, Admin. Body: `{ "feedback": "..." }` (valfritt). Skapar approval + command.
- `POST /api/tasks/:id/reject` – Orchestrator, Admin. Body: `{ "feedback": "..." }` (obligatoriskt).
- `POST /api/tasks/:id/revision` – Orchestrator, Admin. Body: `{ "feedback": "..." }`.

### Metrics

- `GET /api/metrics` – Alla inloggade. Query: `category`, `period`, `from`, `to`.
- `GET /api/metrics/summary` – Alla inloggade. Förberäknade KPI-kort.

### Aktivitetslogg

- `GET /api/activity` – Alla inloggade. Query: `agent_slug`, `action`, `from`, `to`, `search`, `page`, `per_page`.

### Kill switch

- `POST /api/kill-switch` – Orchestrator, Admin. Body: `{ "action": "activate" | "deactivate" }`. Skriver till `commands`.
- `GET /api/kill-switch/status` – Alla inloggade.

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

| Lager | Ansvarig för | Ansvarar INTE för |
|-------|-------------|-------------------|
| Frontend | Rendering, navigation, UX, PWA | Affärslogik, autentiseringslogik |
| FIA API | Auth, auktorisering, validering, commands | Rendering, layout |
| Gateway | Agentexekvering, LLM-anrop, MCP, schemaläggning | Användarhantering, UI |

### Frontendregler

1. Noll direkt DB-mutation – allt via FIA API
2. Läsning via Supabase-klient tillåtet (SELECT + Realtime)
3. Alla API-anrop via centralt servicelager (`fia-api.ts`)
4. Env-variabler för alla URL:er
5. Ingen Lovable-specifik kod

### Migrationsväg

| Fas | Host | Ändring |
|-----|------|---------|
| MVP | Lovable | Custom domän |
| V2 | Vercel/Netlify | Byt DNS + env |
| V3 | Egen server | `npm run build` → Nginx |

### Dashboard – teknisk arkitektur

#### Teknikstack

| Komponent | Teknik | Version |
|-----------|--------|---------|
| UI-ramverk | React | 18.3.1 |
| Byggverktyg | Vite (SWC) | 5.4.19 |
| Språk | TypeScript | 5.8.3 |
| Styling | Tailwind CSS + shadcn/ui (Radix) | 3.4.17 |
| Server state | TanStack React Query | 5.83.0 |
| Routing | React Router DOM | 6.30.1 |
| Formulär | React Hook Form + Zod | 7.61.1 / 3.25.76 |
| Grafer | Recharts | 2.15.4 |
| Ikoner | Lucide React | 0.462.0 |
| i18n | i18next + react-i18next | 25.8.17 / 16.5.6 |
| Backend-klient | @supabase/supabase-js | 2.99.0 |
| Test | Vitest + Testing Library | 3.2.4 |

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
│   ├── TaskDetailSheet.tsx  # Task-detaljvy (sheet)
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

| Egenskap | Värde |
|----------|-------|
| Max concurrent | 3 (env: `QUEUE_MAX_CONCURRENCY`) |
| Prioritetsordning | urgent (0) → high (1) → normal (2) → low (3) |
| Status | queued, running, completed, failed |
| Persistence | Ingen (in-memory). Föräldralösa tasks markeras `error` vid startup. |

Funktioner:
- Pausa/återuppta från Slack eller API
- Progress-callback → Slack + activity_log
- Recovery vid startup: `in_progress`-tasks utan ägare markeras som `error`

---

## Schemalagda uppgifter

| Tid | Agent | Uppgift | Cron |
|-----|-------|---------|------|
| 07:00 mån–fre | Analytics | Morgonpuls | `0 7 * * 1-5` |
| 08:00 måndag | Strategy | Veckoplanering | `0 8 * * 1` |
| 09:00 mån/ons/fre | Content | Schemalagt innehåll | `0 9 * * 1,3,5` |
| 10:00 dagligen | Lead | Lead scoring | `0 10 * * *` |
| 14:00 fredag | Analytics | Veckorapport | `0 14 * * 5` |
| 09:00 första måndagen | Strategy | Månadsplanering | `0 9 1-7 * 1` |
| 09:00 sista fredagen Q | Analytics | Kvartalsöversikt | `0 9 25-31 3,6,9,12 5` |

Alla schemalagda tasks respekterar kill switch och agent-pausstatus.

---

## Slack-kommandon

| Kommando | Beskrivning |
|----------|-------------|
| `/fia status` | Systemstatus (agenter, kill switch, kö, scheduler) |
| `/fia kill` | Aktivera kill switch |
| `/fia resume` | Avaktivera kill switch |
| `/fia run <agent> <task>` | Manuell trigger av agent |
| `/fia approve <task-id>` | Godkänn uppgift |
| `/fia reject <task-id>` | Avslå uppgift |
| `/fia queue` | Visa köade uppgifter |
| `/fia purge` | Rensa föräldralösa tasks |

Slack-kanaler:

| Kanal | Innehåll |
|-------|----------|
| `#fia-content` | Content Agent progress |
| `#fia-campaigns` | Campaign Agent progress |
| `#fia-analytics` | Analytics Agent progress |
| `#fia-orchestrator` | Strategy/Lead/Brand/SEO progress + eskaleringar |

---

## Strukturerad output (tool_use)

Claude API:s tool_use används för att få strukturerad output från agenter. Två verktyg definierade:

| Verktyg | Agent | Syfte |
|---------|-------|-------|
| `content_response` | Content, Campaign, Lead | Strukturerad content-output (title, body, summary, metadata) |
| `brand_review_decision` | Brand | Strukturerat granskningsbeslut (approved/rejected, feedback, scores) |

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

### Forefront – varför vi finns

Vi bidrar till utvecklingen av ett hållbart samhälle i framkant genom att säkerställa att människa och teknik går hand i hand.

### Löfte

Delade visioner. Större ambitioner.

### Övertygelser

1. Sikta högre – modiga idéer, långsiktiga möjligheter
2. Ständigt göra bättre – kontinuerlig förbättring
3. Alltid ihop – nära partnerskap, fler perspektiv

### Karaktärsdrag

Modiga, Hängivna, Lustfyllda

### Tonalitetsregler

1. Skriv som till en klok kollega
2. Var konkret och tydlig
3. Visa nyfikenhet
4. Humor tillåtet, aldrig på andras bekostnad
5. Aktivt språk
6. Varje text ska ha en tydlig poäng

### Budskapshierarki

- **Nivå 1 (hero):** "Vi ser framåt – Vad ser du?", "Bra, och lite läskigt – så ska rätt beslut kännas"
- **Nivå 2–3** för artiklar och sociala medier

### Visuell identitet

- Organiska färger: `#7D5365`, `#42504E`, `#555977`, `#756256`, `#7E7C83`
- Gradient (energi): `#FF6B0B` → `#FFB7F8` → `#79F2FB`
- Typsnitt: Manrope (fallback Arial)
- Logotyp: "forefront" i gemener, Manrope Semibold

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

## Teknisk skuld (2026-03-19) — ✅ Backend åtgärdad 2026-03-19

Identifierade brister vid kodgranskning. Prioriterade efter allvarlighetsgrad.

### Backend – Hög prioritet (alla åtgärdade)

| # | Fil | Problem | Status |
|---|-----|---------|--------|
| ~~B1~~ | `src/agents/agent-loader.ts` | `parseSkillReference()` saknar bounds check | ✅ Redan fixat (validering fanns) |
| ~~B2~~ | `src/agents/brand/brand-agent.ts` | `rejectionCounts` Map växer obegränsat | ✅ Timestamp + 24h cleanup |
| ~~B3~~ | `src/context/context-manager.ts` | Filcache har ingen TTL | ✅ 5 min TTL med `CACHE_TTL_MS` |

### Backend – Medel prioritet (alla åtgärdade)

| # | Fil | Problem | Status |
|---|-----|---------|--------|
| ~~B4~~ | `src/api/routes/tasks.ts` | Sort-parameter saknar whitelist-validering | ✅ Whitelist med fallback till `created_at` |
| ~~B5~~ | `src/api/server.ts` | Ingen API rate limiting | ✅ `express-rate-limit` (100 req/15 min) |
| ~~B6~~ | `src/gateway/scheduler.ts` | Generisk felhantering | ✅ Typklassificering (timeout/auth/llm/network) |
| ~~B7~~ | `src/gateway/task-queue.ts` | Ingen prioritetsåldring | ✅ Aging: +1 nivå var 30:e minut |
| ~~B8~~ | `.github/workflows/ci.yml` | Ingen CI/CD-pipeline | ✅ GitHub Actions: typecheck + lint + test |
| ~~B9~~ | `eslint.config.mjs`, `.prettierrc` | Ingen ESLint/Prettier | ✅ Flat config + Prettier, `npm run lint/format` |
| ~~B10~~ | `src/gateway/logger.ts` | `JSON.stringify()` kan krascha | ✅ try/catch med fallback-logg |
| ~~B11~~ | Genomgripande | Inga korrelations-ID:n | ✅ `correlation_id` i LogEntry, AgentTask, API middleware |
| ~~B12~~ | `src/utils/kill-switch.ts` | Hårdkodade agent-slugs | ✅ `.neq("slug", "brand")` – pausar alla utom Brand |

### Frontend – Hög prioritet

| # | Fil | Problem | Risk |
|---|-----|---------|------|
| F1 | `tsconfig.app.json` | `strict: false`, `noImplicitAny: false` | Typfel upptäcks ej vid kompilering |
| F2 | — | Ingen React Error Boundary | Komponentkrasch tar ner hela appen |
| F3 | — | Testsvit obefintlig (1 trivial test) | Inga regressionsgarantier |
| F4 | `DashboardLayout.tsx` | Sökfält utan handler (icke-funktionellt) | Förvirrande UX |
| F5 | `DashboardLayout.tsx` | Bell-ikon utan click handler (icke-funktionellt) | Förvirrande UX |

### Frontend – Medel prioritet

| # | Fil | Problem | Risk |
|---|-----|---------|------|
| F6 | Diverse | Saknar ARIA-labels på ikon-knappar | Tillgänglighetsbrist |
| F7 | `fia-api.ts` | `fetchKpi()` hämtar hela tasks-tabellen två gånger | Prestanda vid stor datamängd |
| F8 | Diverse | Ingen paginering för agents/tasks-listor | Prestanda vid skalning |
| F9 | Diverse | Flera mutations saknar `onError`-handlers | Tysta fel för användaren |
| F10 | — | Statusfärger utan ikon/text-fallback | Otillgängligt för färgblinda |

---

## Kostnadsanalys

### Löpande månadskostnad (full drift)

| Post | Låg | Hög |
|------|-----|-----|
| Claude API (Opus + Sonnet) | 3 000 kr | 10 000 kr |
| Nano Banana 2 | 200 kr | 500 kr |
| Serper.dev | 200 kr | 500 kr |
| GCP Compute Engine | 150 kr | 250 kr |
| Supabase | 0 kr | 250 kr |
| Lovable | 0 kr | 200 kr |
| Slack Pro | 800 kr | 800 kr |
| **Drift totalt** | **4 350 kr** | **12 500 kr** |
| Marketing Orchestrator (25%) | 20 000 kr | 35 000 kr |
| **Totalt med personal** | **24 350 kr** | **47 500 kr** |

Jämförelse: traditionell marknadsavdelning 120 000–200 000 kr/mån. FIA ger 60–75% besparing.

### Engångsinvestering

| Post | Kostnad |
|------|---------|
| Gateway-utveckling | 40 000–80 000 kr |
| Dashboard (PWA) | 15 000–30 000 kr |
| GCP-setup | 5 000–10 000 kr |
| MCP-wrappers | 10 000–20 000 kr |
| gws-integration | 5 000–10 000 kr |
| Prompt engineering | 30 000–50 000 kr |
| Test och QA | 10 000–20 000 kr |
| **Totalt** | **115 000–220 000 kr** |

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

| Dimension | Vad den mäter |
|-----------|--------------|
| tonality | Följer tonalitetsregler och karaktärsdrag |
| accuracy | Faktakorrekthet, inga hallucinationer |
| clarity | Tydlighet, struktur, läsbarhet |
| brand_fit | Varumärkeskonsistens, budskapshierarki |
| channel_fit | Passar kanalen (längd, format, CTA) |

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
  "top_issues": [
    "Texterna tenderar att bli för långa och akademiska",
    "Saknar tydlig CTA i LinkedIn-poster"
  ],
  "exemplary_tasks": ["task-uuid-1", "task-uuid-2"]
}
```

### Dynamisk sample_review_rate

| Snittbetyg (20+ tasks) | Effekt |
|------------------------|--------|
| ≥ 4.0 | `sample_review_rate` sänks (min 0.1) |
| 3.0–3.9 | Ingen ändring |
| 2.5–2.9 | `sample_review_rate` höjs (max 1.0) |
| < 2.5 | Flaggas för manuell intervention, agent pausas |

Tröskelvärdena konfigureras i `system_settings` (nyckel: `feedback_thresholds`).

### Fas 3-utökning: Few-shot "avoid"-exempel

Tasks med betyg 1-2 och kommentarer extraheras automatiskt som negativa few-shot-exempel i agentens `context/few-shot/`-katalog (t.ex. `avoid-001.md`).

---

## Roadmap

Tempo: Fas 0 + fas 1 (deploy 0.1) genomfördes på 4 arbetsdagar. Tidsestimaten nedan är justerade efter faktiskt tempo.

### Fas 0: Förberedelse (Dag 1) ✅

- GCP-projekt, Compute Engine, IAM, Service Accounts
- Git-repos, projektstruktur
- Varumärkesplattform som markdown
- Agent-mappstruktur med `agent.yaml`
- API-konton (Gemini, Slack, Anthropic)
- gws CLI-autentisering
- Supabase-projekt (EU) med datamodell, RLS, Auth
- Utse Marketing Orchestrator
- Slack-workspace med kanaler

### Fas 1: MVP – Content + Brand + Dashboard (Dag 2–4) ✅

**Status: Deploy 0.2 (2026-03-15)**

**Gateway:**
- ✅ Gateway (Node.js daemon, Slack, cron, task queue)
- ✅ Supabase-klient (heartbeats, tasks, activity_log, realtime-lyssnare)
- ✅ Modell-router (manifest-driven, Claude Opus/Sonnet + Nano Banana + Serper)
- ✅ Agent-loader med modulärt skill-system (shared: + agent:)
- ✅ Alla 7 agentkluster implementerade (Content, Brand, Strategy, Campaign, SEO, Lead, Analytics)
- ✅ Claude API-integration (Opus 4.6 + Sonnet 4.6) med tool_use för strukturerad output
- ✅ REST API med JWT-auth + Zod-validering
- ✅ Kill switch dual (Slack + Dashboard) med audit trail
- ✅ Testsvit (13 testfiler: router, brand-agent, agent-loader, content-agent, logger, config, skill-loader, task-queue, parallel-screening, self-eval, retry, integration)
- ✅ Kostnadsberäkning (tokens → USD → SEK)
- ✅ Task recovery vid startup
- ✅ Self-eval scoring i base-agent
- ✅ Parallel pre-screening (Brand Agent quick-screen)
- ✅ Exponential backoff retry för LLM-anrop

**Dashboard:**
- ✅ Auth (Supabase, login/signup, rollhantering: orchestrator/admin/viewer/nobody)
- ✅ Agentöversikt med puls/status/heartbeat
- ✅ Godkännandekö (approve/reject/revision + dual-write audit trail)
- ✅ Kill switch (toggle + realtidsuppdatering)
- ✅ Aktivitetslogg med paginering (20/sida)
- ✅ Realtime-sync (7 tabeller via Supabase PostgreSQL Changes)
- ✅ i18n (svenska + engelska, 409 strängar per språk)
- ✅ Teman (5 färgscheman × ljust/mörkt, persisterat till DB)
- ✅ PWA-stöd (service worker, manifest, offline caching)
- ✅ Kostnadssida, kalendervy, inställningar
- ✅ Responsiv design med mobil bottom-nav

**Kvarstår från fas 1:**
- ⏳ Gemini context caching – planerad
- ⏳ GA4 Analytics API – planerad
- ⏳ gws MCP – konfigurerad men ej kopplad till agenter
- ⏳ 10 innehållsenheter producerade
- ⏳ Sökfunktion i dashboard (input finns, logik saknas)
- ⏳ Error boundaries i dashboard
- Go/no-go: 80% publiceringsredo

### Fas 2: Expansion + Content Staging (Dag 5–12)

- Strategy, Campaign, SEO, Lead, Analytics agenter kopplade till externa system
- MCP-wrappers: LinkedIn, HubSpot, Buffer (`src/mcp/` – ej påbörjat)
- Första agentdrivna kampanjen
- Dashboard: rapporter, agentdetalj, push, mörkt läge (mörkt läge ✅ klar)
- Dashboard: sökfunktion, notifikationssystem, error boundaries
- Dashboard: TypeScript strict mode
- CI/CD: GitHub Actions för test + build
- ESLint + Prettier för backend
- Content Staging:
  - Standardiserat `content_json`-schema i gateway (Zod-validering)
  - Output-validering för alla content-producerande agenter
  - Dashboard: staging-vy med markdown-preview + kanalspecifika previews
  - Bildhantering via Google Drive-URL:er i `media[]`
- Teknisk skuld: B1–B3, F1–F3 (se "Teknisk skuld"-sektionen)
- Go/no-go: Kampanj i paritet

### Fas 3: Optimering + Feedback (Dag 13–18)

- Promptoptimering, ökad autonomi, kostnadsoptimering, ROI
- Feedback & Agentoptimering:
  - `feedback`-tabell i Supabase + RLS
  - Dashboard: rating-UI + trendgrafer i agentdetalj
  - Gateway: `feedback-summary.json` per agent i `system_context`
  - Dynamisk `sample_review_rate`
  - Few-shot "avoid"-exempel

### Fas 4: Full drift (Dag 19–22)

- Dokumentation, SLA:er, backup-Orchestrator, kundcase

**Totalt:** ~22 arbetsdagar (~4 veckor). Originalplanen antog 20 veckor. Faktisk hastighet ~5x snabbare.

---

## Team

### Uppbyggnad (fas 0–2)

| Roll | Omfattning |
|------|-----------|
| FIA-arkitekt / Tech Lead | 80–100% i ~3 veckor |
| Marketing Orchestrator | 25% i ~3 veckor |

Faktiskt tempo: Fas 0–1 genomfördes på 4 arbetsdagar av en person med Claude Code + Lovable.

### Drift (fas 3+)

| Roll | Tid/vecka |
|------|-----------|
| Marketing Orchestrator | 8–10 tim |
| Tekniskt underhåll | 2–4 tim |

---

## Licenser

### Dag 1

| Tjänst | Kostnad/mån |
|--------|-------------|
| Anthropic Claude API | ~300–1 000 kr |
| Google AI Studio API (Nano Banana 2) | ~100–350 kr |
| Serper.dev | ~100–200 kr |
| GCP Compute Engine | ~150–250 kr |
| Slack Pro | ~80 kr/användare |
| Supabase | 0–250 kr |
| Lovable | 0–200 kr |
| gws CLI | 0 kr (Apache-2.0) |

### Fas 2

| Tjänst | Kostnad/mån |
|--------|-------------|
| HubSpot | 0–800 kr |
| Buffer | ~600 kr |

---

## Beroenden (package.json)

### Produktion

| Paket | Version | Syfte |
|-------|---------|-------|
| `@anthropic-ai/sdk` | ^0.39.0 | Claude API (Opus 4.6 + Sonnet 4.6) |
| `@google/genai` | ^1.0.0 | Nano Banana 2 bildgenerering |
| `@slack/bolt` | ^4.1.0 | Slack SDK (Socket Mode) |
| `@supabase/supabase-js` | ^2.49.0 | Supabase-klient |
| `express` | ^4.21.0 | REST API (internt) |
| `node-cron` | ^3.0.3 | Schemaläggning |
| `yaml` | ^2.7.0 | Parsning av agent.yaml |
| `zod` | ^4.3.6 | Validering |
| `uuid` | ^11.1.0 | Task-ID:n |
| `dotenv` | ^16.4.7 | Miljövariabler |

### Utveckling

| Paket | Version | Syfte |
|-------|---------|-------|
| `typescript` | ^5.9.3 | Kompilator (strict mode) |
| `ts-node` | ^10.9.2 | Direkt TS-exekvering |
| `jest` + `ts-jest` | ^29.7.0 / ^29.3.0 | Testramverk |
| `nodemon` | ^3.1.0 | Dev watch mode |

---

## Miljövariabler

Se `.env.example` för alla nyckelnamn. Aldrig i kod. Kritiska:

```
ANTHROPIC_API_KEY          # Claude API (krävs)
GEMINI_API_KEY             # Nano Banana 2 (valfritt)
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

---

## Vibecoding

~75% av gateway-koden vibecoded med Claude Code. ~25% kräver manuell granskning (router, MCP-wrappers, context caching, loggning, SQL-migrationer). Dashboard: ~90% vibecoded i Lovable, ~10% manuell integration.

Faktiskt resultat fas 0–1: 43 TypeScript-filer, komplett gateway + dashboard MVP, deploy 0.2 live – på 4 arbetsdagar.
