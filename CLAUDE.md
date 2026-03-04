# FIA – Forefront Intelligent Automation

## Projektöversikt

FIA är en persistent, always-on AI-agentgateway som ersätter Forefronts marknadsavdelning. Sju specialiserade agentkluster utför allt operativt marknadsarbete. 1–2 människor ("Marketing Orchestrators") styr systemet – de sätter riktning och godkänner, men utför inte det operativa arbetet.

**Princip:** Human on the loop – agenter beslutar och exekverar inom definierade ramar.

**Dual-interface:** Orchestrator interagerar via två parallella gränssnitt:

1. **Slack** – kommandodrivet textgränssnitt för instruktioner, godkännanden och rapporter
2. **FIA Dashboard (PWA)** – grafisk överblick, godkännandekö, KPI:er och kill switch

Gateway är källan till sanning. Den skriver agentdata till Supabase, och dashboarden läser via Supabase Realtime. Kommandon (pausa, godkänn, kill switch) kan ges via båda gränssnitten.

## Teknikstack

### FIA Gateway

- **Runtime:** Node.js (persistent daemon via PM2)
- **Språk:** TypeScript
- **Meddelandegränssnitt:** Slack API (Bolt SDK, Socket Mode)
- **Schemaläggning:** node-cron
- **LLM-primär:** Anthropic API (Claude Sonnet 4.5 + Haiku 4.5)
- **Bildgenerering:** Ideogram 3.0 API
- **Realtidssökning:** Perplexity Sonar API
- **Integrationer:** MCP-servrar (Slack, Gmail, Google Calendar, WordPress, HubSpot, LinkedIn, GA4)
- **Kunskapsbas:** Filbaserad (markdown + JSON), ingen vektordatabas i v1
- **Loggning:** Strukturerad JSON (audit trail) + synk till Supabase
- **Process manager:** PM2
- **Hosting:** Hetzner VPS (Ubuntu 24 LTS, EU/GDPR)
- **Databas-klient:** @supabase/supabase-js (skriver heartbeats, tasks, metrics, activity_log)
- **REST API:** Express / Fastify (intern, tar emot kommandon från Dashboard via Edge Functions)

### FIA Dashboard (separat repo – byggs i Lovable)

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Deployment:** Lovable hosting med custom domän (fia.forefront.se)
- **PWA:** Service worker för offline-stöd och installering på hemskärm
- **Realtid:** Supabase Realtime för live-uppdateringar av agentstatus
- **Diagram:** Recharts för KPI-visualiseringar

### Delad infrastruktur

- **Databas:** Supabase PostgreSQL (EU-region) – gemensam datakälla för Gateway och Dashboard
- **Auth:** Supabase Auth (e-post/lösenord + Google OAuth, Forefront-domän)
- **Realtid:** Supabase Realtime (postgres_changes) för live-uppdateringar

## Projektstruktur

```
fia/
├── CLAUDE.md                    # Denna fil
├── package.json
├── tsconfig.json
├── .env.example                 # Mall för miljövariabler
├── .gitignore
├── ecosystem.config.js          # PM2-konfiguration
│
├── src/
│   ├── index.ts                 # Entrypoint – startar gateway
│   ├── gateway/
│   │   ├── gateway.ts           # Huvudklass – orkestrerar allt
│   │   ├── scheduler.ts         # Cron-baserade triggers
│   │   ├── router.ts            # Multi-modell-routing (KRITISK – granska manuellt)
│   │   └── logger.ts            # Strukturerad JSON-loggning (KRITISK)
│   │
│   ├── slack/
│   │   ├── app.ts               # Slack Bolt-app (Socket Mode)
│   │   ├── commands.ts          # Slash-kommandon (/fia, /kill, /status)
│   │   ├── handlers.ts          # Meddelandehantering och eskaleringar
│   │   └── channels.ts          # Kanalkonfiguration per agent
│   │
│   ├── supabase/
│   │   ├── client.ts            # Supabase-klient (@supabase/supabase-js)
│   │   ├── heartbeat.ts         # Skriver agent-heartbeats periodiskt
│   │   ├── task-writer.ts       # Skriver tasks vid skapande och statusändringar
│   │   ├── metrics-writer.ts    # Skriver KPI-data (daily/weekly/monthly)
│   │   ├── activity-writer.ts   # Skriver till activity_log vid varje agentbeslut
│   │   └── command-listener.ts  # Lyssnar på commands-tabell via Supabase Realtime
│   │
│   ├── api/
│   │   ├── server.ts            # Express/Fastify REST API (intern, ej exponerad mot internet)
│   │   ├── routes/
│   │   │   ├── agents.ts        # GET /api/agents, POST /api/agents/:slug/pause|resume
│   │   │   ├── tasks.ts         # GET /api/tasks, POST /api/tasks/:id/approve|reject|revision
│   │   │   ├── metrics.ts       # GET /api/metrics
│   │   │   └── kill-switch.ts   # POST /api/kill-switch
│   │   └── middleware/
│   │       └── auth.ts          # Validerar JWT från Supabase Edge Functions
│   │
│   ├── agents/
│   │   ├── base-agent.ts        # Abstrakt basklass för alla agenter
│   │   ├── agent-loader.ts      # Läser SKILL.md och bygger systemprompt
│   │   ├── strategy/
│   │   │   └── strategy-agent.ts
│   │   ├── content/
│   │   │   └── content-agent.ts
│   │   ├── campaign/
│   │   │   └── campaign-agent.ts
│   │   ├── seo/
│   │   │   └── seo-agent.ts
│   │   ├── lead/
│   │   │   └── lead-agent.ts
│   │   ├── analytics/
│   │   │   └── analytics-agent.ts
│   │   └── brand/
│   │       └── brand-agent.ts   # Vetorätt – granskar allt före publicering
│   │
│   ├── llm/
│   │   ├── anthropic.ts         # Claude Sonnet/Haiku-klient med prompt caching
│   │   ├── ideogram.ts          # Bildgenerering
│   │   ├── perplexity.ts        # Realtidssökning (Sonar API)
│   │   └── types.ts             # Gemensamma LLM-typer
│   │
│   ├── mcp/
│   │   ├── mcp-client.ts        # Generisk MCP-klientklass
│   │   ├── wordpress.ts         # WordPress MCP-wrapper (fas 1) (KRITISK)
│   │   ├── hubspot.ts           # HubSpot MCP-wrapper (fas 2)
│   │   ├── linkedin.ts          # LinkedIn API MCP-wrapper (fas 2)
│   │   ├── ga4.ts               # Google Analytics 4 MCP-wrapper (fas 2)
│   │   └── buffer.ts            # Buffer/social media MCP-wrapper (fas 2)
│   │
│   ├── context/
│   │   ├── context-manager.ts   # Läser och cachar kunskapsbas
│   │   └── prompt-builder.ts    # Bygger systemprompt med varumärkeskontext
│   │
│   └── utils/
│       ├── config.ts            # Env-hantering och validering
│       ├── errors.ts            # Feltyper och felhantering
│       └── kill-switch.ts       # Nödbroms – pausar alla publiceringsagenter
│
├── knowledge/
│   ├── brand/
│   │   ├── platform.md          # Varumärkesplattform
│   │   ├── tonality.md          # Tonalitetsregler och exempel
│   │   ├── visual.md            # Visuell identitet
│   │   └── messages.md          # Budskapshierarki nivå 1–3
│   ├── agents/
│   │   ├── strategy/SKILL.md
│   │   ├── content/SKILL.md
│   │   ├── campaign/SKILL.md
│   │   ├── seo/SKILL.md
│   │   ├── lead/SKILL.md
│   │   ├── analytics/SKILL.md
│   │   └── brand/SKILL.md
│   ├── content/
│   │   └── archive/             # Publicerat innehåll (referens)
│   └── campaigns/               # Kampanjresultat och lärdomar
│
├── supabase/
│   ├── migrations/              # SQL-migreringar för datamodell
│   │   └── 001_initial_schema.sql
│   └── seed.sql                 # Seed-data (7 agenter)
│
├── logs/                        # JSON-loggar (gitignored)
│
└── tests/
    ├── router.test.ts           # Modell-routing-tester
    ├── brand-agent.test.ts      # Brand Agent granskningslogik
    ├── logger.test.ts           # Loggformat och audit trail
    ├── supabase-writer.test.ts  # Supabase-skrivningar
    └── mcp/
        └── wordpress.test.ts    # WordPress-integration
```

## Viktiga konventioner

### Kodstil

- TypeScript strict mode
- Async/await överallt (inga callbacks)
- Explicit typer på alla publika funktioner
- Felhantering: alla LLM-anrop wrappas i try/catch med strukturerad loggning
- Inga beroenden på externa agent-ramverk – vi bygger tunt och kontrollerat

### Modell-routing (KRITISK – granska manuellt)

Routern bestämmer vilken LLM som hanterar varje uppgift. Felaktig routing = fel modell = fel resultat. Regler:

| Agent | Uppgift | Modell |
|-------|---------|--------|
| Content Agent | Alla texter, kopia | Claude Sonnet |
| Content Agent | Metadata, alt-texter, A/B-varianter | Claude Haiku |
| Content Agent | Bildgenerering | Ideogram 3.0 |
| Brand Agent | All granskning | Claude Sonnet (alltid) |
| Strategy Agent | Planering, ramverk | Claude Sonnet |
| Strategy Agent | Research, omvärldsbevakning | Perplexity Sonar |
| Campaign Agent | Kampanjstrategi, slutgiltig kopia | Claude Sonnet |
| Campaign Agent | A/B-varianter, segmentering | Claude Haiku |
| SEO Agent | Sökanalys, trendspaning | Perplexity Sonar |
| SEO Agent | Bulkoptimering | Claude Haiku |
| SEO Agent | Innehållsrekommendationer | Claude Sonnet |
| Lead Agent | Scoring, klassificering | Claude Haiku |
| Lead Agent | Nurture-sekvenser | Claude Sonnet |
| Analytics Agent | Dataextraktion | Claude Haiku |
| Analytics Agent | Insikter, rapportskrivning | Claude Sonnet |

### Prompt caching

Använd Anthropics prompt caching på varumärkeskontexten (platform.md, tonality.md etc.) som läggs i systempromptens statiska del. Detta minskar kostnaden med ~90% efter första anropet.

### Loggning (KRITISK – granska manuellt)

Varje agentbeslut loggas med:

```json
{
  "timestamp": "ISO-8601",
  "agent": "content",
  "task_id": "uuid",
  "model": "claude-sonnet-4-5-20250929",
  "action": "generate_blog_post",
  "input_hash": "sha256 av input",
  "output_summary": "Kort sammanfattning av output",
  "tokens_in": 1234,
  "tokens_out": 5678,
  "cost_usd": 0.023,
  "duration_ms": 3400,
  "status": "success|error|escalated",
  "brand_review": "approved|rejected|pending"
}
```

### MCP-wrappers (KRITISK – granska manuellt)

Tunna TypeScript-wrappers (50–200 rader per integration) som exponerar minsta möjliga operationer. Principen "minsta möjliga rättighet":

- **WordPress:** createDraft, publishPost, updatePost, getPost
- **HubSpot:** createContact, updateContact, getContacts, updateDeal
- **LinkedIn:** createPost, getAnalytics
- **GA4:** getReport, getRealtimeData
- **Buffer:** createPost, schedulePost, getAnalytics

### Supabase-datamodell

Gateway skriver till Supabase. Dashboard läser via Supabase Realtime. Sex tabeller:

#### profiles

Kopplad till Supabase Auth (en-till-en med auth.users).

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',  -- orchestrator | admin | viewer
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### agents

Register över de sju agenterna med status och heartbeat.

```sql
CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                    -- 'Strategy Agent', 'Content Agent', etc.
  slug text NOT NULL UNIQUE,             -- strategy, content, campaign, seo, lead, analytics, brand
  status text NOT NULL DEFAULT 'active', -- active | paused | error | idle
  autonomy_level text NOT NULL,          -- autonomous | semi-autonomous | manual
  last_heartbeat timestamptz,
  config_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### tasks

Alla uppgifter som agenter producerar. Central tabell för godkännandeflödet.

```sql
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  type text NOT NULL,                     -- blog_post, social_media, newsletter, campaign, report, review
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued',  -- queued | in_progress | awaiting_review | approved | rejected | published
  priority text NOT NULL DEFAULT 'normal', -- low | normal | high | urgent
  content_json jsonb,                     -- Uppgiftens payload (text, bilder, metadata)
  model_used text,                        -- sonnet | haiku | ideogram | perplexity
  tokens_used integer,
  cost_sek numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
```

#### approvals

Granskningshistorik per uppgift. Både Brand Agent-granskningar och mänskliga godkännanden.

```sql
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  reviewer_type text NOT NULL,            -- brand_agent | orchestrator | ledningsgrupp
  reviewer_id uuid REFERENCES profiles(id), -- null om brand_agent
  decision text NOT NULL,                 -- approved | rejected | revision_requested
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### metrics

KPI-data per period. Analytics Agent skriver hit. Dashboard läser för grafer.

```sql
CREATE TABLE metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,                 -- content | traffic | leads | cost | brand
  metric_name text NOT NULL,              -- blog_posts_published, organic_sessions, mql_count, etc.
  value numeric NOT NULL,
  period text NOT NULL,                   -- daily | weekly | monthly
  period_start date NOT NULL,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### activity_log

Sökbar audit trail. Varje agentbeslut och mänsklig åtgärd loggas hit.

```sql
CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id),   -- null om mänsklig åtgärd
  user_id uuid REFERENCES profiles(id),  -- null om agentåtgärd
  action text NOT NULL,                   -- task_created, review_passed, review_failed, published, escalated, paused, etc.
  details_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### Row Level Security (RLS)

```sql
-- Alla inloggade kan läsa
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- SELECT: alla inloggade
CREATE POLICY "select_all" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON agents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON tasks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON approvals FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON metrics FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "select_all" ON activity_log FOR SELECT USING (auth.uid() IS NOT NULL);

-- UPDATE/INSERT: enbart orchestrator och admin
CREATE POLICY "update_agents" ON agents FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);
CREATE POLICY "update_tasks" ON tasks FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);
CREATE POLICY "insert_approvals" ON approvals FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);
```

#### Seed-data (7 agenter)

```sql
INSERT INTO agents (name, slug, status, autonomy_level) VALUES
  ('Strategy Agent', 'strategy', 'active', 'semi-autonomous'),
  ('Content Agent', 'content', 'active', 'autonomous'),
  ('Campaign Agent', 'campaign', 'active', 'autonomous'),
  ('SEO Agent', 'seo', 'active', 'autonomous'),
  ('Lead Agent', 'lead', 'active', 'autonomous'),
  ('Analytics Agent', 'analytics', 'active', 'autonomous'),
  ('Brand Agent', 'brand', 'active', 'autonomous');
```

### Gateway → Dashboard dataflöde

```
FIA Gateway → Supabase (skriver tasks, metrics, activity_log, agent heartbeats)
     ↑                           ↓
     │                    FIA Dashboard (läser via Supabase Realtime)
     │                           │
     └───────────────────────────┘
        (kommandon via Edge Functions: pause, approve, kill switch)
```

**Gateway skriver till Supabase (src/supabase/):**

- `heartbeat.ts` – uppdaterar `agents.last_heartbeat` var 60:e sekund
- `task-writer.ts` – skapar/uppdaterar tasks vid varje steg i agentflödet
- `metrics-writer.ts` – Analytics Agent skriver KPI-data per period
- `activity-writer.ts` – loggar alla agentbeslut till activity_log

**Gateway lyssnar från Dashboard (src/supabase/):**

- `command-listener.ts` – prenumererar på Supabase Realtime (commands-tabell) för Dashboard-kommandon

**Dashboard anropar Gateway (via Supabase Edge Functions som proxy):**

### REST API-endpoints (Gateway)

Dashboarden kommunicerar med Gateway via Edge Functions i Supabase som proxy.

| Endpoint | Metod | Beskrivning |
|----------|-------|-------------|
| `/api/agents` | GET | Hämta alla agenters status |
| `/api/agents/:slug/pause` | POST | Pausa en agent |
| `/api/agents/:slug/resume` | POST | Återuppta en agent |
| `/api/agents/:slug/config` | PUT | Uppdatera agentkonfiguration |
| `/api/tasks` | GET | Lista uppgifter (filtrering, pagination) |
| `/api/tasks/:id/approve` | POST | Godkänn uppgift |
| `/api/tasks/:id/reject` | POST | Avslå uppgift med motivering |
| `/api/tasks/:id/revision` | POST | Begär revision |
| `/api/metrics` | GET | Hämta KPI-data (period, kategori) |
| `/api/kill-switch` | POST | Aktivera/deaktivera global paus |

REST API:t exponeras INTE mot internet. Edge Functions i Supabase agerar proxy – de validerar JWT och vidarebefordrar till Gateway på det interna nätverket.

### Dashboard-roller och autentisering

| Roll | Beskrivning | Behörigheter |
|------|-------------|-------------|
| Orchestrator | Marketing Orchestrator | Full åtkomst: godkänna, pausa, konfigurera, kill switch |
| Ledningsgrupp (viewer) | Strategisk överblick | Läsvy: dashboards, rapporter, KPI:er |
| Admin | FIA-arkitekt / Tech Lead | Allt ovan + agent-konfiguration, loggvy, debug-verktyg |

- **Inloggning:** e-post/lösenord + Google OAuth (Forefront-domän)
- **Registrering:** enbart inbjudan (Admin bjuder in)
- **Sessionslängd:** 30 dagar (refresh token)

## Agent-arkitektur

Varje agent är en klass som ärver från BaseAgent och har en tillhörande SKILL.md-fil i knowledge/agents/. Gatewayen läser SKILL.md och konstruerar systemprompt + verktygskontext.

### BaseAgent-kontrakt

```typescript
abstract class BaseAgent {
  abstract name: string;
  abstract defaultModel: 'sonnet' | 'haiku' | 'perplexity' | 'ideogram';
  abstract skillPath: string;

  // Kör agenten med given uppgift
  abstract execute(task: AgentTask): Promise<AgentResult>;

  // Hämta agentens systemprompt (SKILL.md + varumärkeskontext)
  getSystemPrompt(): string;

  // Logga agentbeslut
  log(entry: LogEntry): void;

  // Eskalera till Orchestrator via Slack
  escalate(reason: string, context: any): Promise<void>;
}
```

### Agentflöde

```
Trigger (cron/Slack/annan agent)
  → Gateway tar emot
  → Router bestämmer agent + modell
  → Agent laddar SKILL.md + varumärkeskontext
  → Agent exekverar uppgift (LLM-anrop)
  → Brand Agent granskar output (om publicering)
  → Godkänt → Publicera via MCP / leverera via Slack
  → Underkänt → Tillbaka till agent med feedback
  → 3x underkänt → Eskalera till Orchestrator
```

### Autonominivåer per innehållstyp

| Innehållstyp | Autonomi | Stickprov |
|--------------|----------|-----------|
| Social media (organiskt) | Full autonom | 1 av 5 |
| Blogginlägg | Autonom + Brand Agent | 1 av 3 |
| Nyhetsbrev | Autonom + Brand Agent + Orchestrator godkänner | Alla |
| Kundcase / pressrelease | Semi-autonom, Orchestrator godkänner | Alla |

## Slack-gränssnitt

### Kanaler

- **#fia-orchestrator** – Huvudkanal, eskaleringar, godkännanden
- **#fia-content** – Content Agent output och Brand Agent reviews
- **#fia-campaigns** – Kampanjrapporter och budgetvarningar
- **#fia-analytics** – Dagliga pulser, veckorapporter, alarm
- **#fia-logs** – Tekniska loggar och systemstatus

### Kommandon

- `/fia status` – Systemstatus, aktiva agenter, köade uppgifter
- `/fia kill` – Kill switch: pausar alla publiceringsagenter
- `/fia resume` – Återaktivera efter kill
- `/fia run <agent> <uppgift>` – Trigga agent manuellt
- `/fia approve <task-id>` – Godkänn eskalerat innehåll
- `/fia reject <task-id> <feedback>` – Avslå med feedback

### Schemalagda uppgifter (cron)

| Tid | Agent | Uppgift |
|-----|-------|---------|
| 07:00 mån-fre | Analytics | Morgonpuls till #fia-orchestrator |
| 08:00 måndag | Strategy | Veckoplanering baserat på kalender |
| 09:00 mån/ons/fre | Content | Producera schemalagt innehåll |
| 10:00 dagligen | Lead | Lead scoring-uppdatering |
| 14:00 fredag | Analytics | Veckorapport |
| 09:00 första måndagen/mån | Strategy | Månadsplanering |
| Sista fredagen/kvartal | Analytics | Kvartalsöversikt |

## Säkerhet och governance

- Alla API-nycklar i `.env`, aldrig i kod. `.env.example` med alla nyckelnamn (utan värden) versionshanteras.
- Gateway exponeras INTE mot internet. Slack använder Socket Mode (utgående websocket).
- Dashboard-kommandon går via Supabase Edge Functions – aldrig direkt till Gateway.
- Row Level Security (RLS) på samtliga Supabase-tabeller – rollbaserad åtkomst.
- Autentisering via Supabase Auth (JWT-tokens), inga API-nycklar i frontend.
- Inbjudningsbaserad registrering – enbart Admin kan bjuda in nya användare.
- Kill switch: `/fia kill` i Slack ELLER kill switch-knapp i Dashboard pausar omedelbart alla publiceringsagenter.
- Principen "minsta möjliga rättighet" per MCP-wrapper.
- All data stannar inom EU (Hetzner datacenter, EU-baserad Supabase-instans).
- Alla agentbeslut loggas med tidstämpel, modell, input-hash och output-sammanfattning.
- Alla användaråtgärder i Dashboard (godkännanden, konfigändringar, kill switch) loggas i activity_log.
- Veckovis logg-review av Orchestrator.
- Månadsvis varumärkesaudit (manuell stickprovskontroll).
- GDPR: ingen persondata i Dashboard utöver namn och e-post.

## Varumärkeskontext (inbäddad i alla innehållsagenter)

### Forefront – varför vi finns

Vi bidrar till utvecklingen av ett hållbart samhälle i framkant genom att säkerställa att människa och teknik går hand i hand.

### Löfte

Delade visioner. Större ambitioner.

### Övertygelser

1. **Sikta högre** – modiga idéer, långsiktiga möjligheter
2. **Ständigt göra bättre** – kontinuerlig förbättring
3. **Alltid ihop** – nära partnerskap, fler perspektiv

### Karaktärsdrag

Modiga, Hängivna, Lustfyllda

### Tonalitetsregler

1. Skriv som till en klok kollega – aldrig neråt, aldrig överdrivet formellt
2. Var konkret och tydlig – undvik vaga formuleringar
3. Visa nyfikenhet – ställ frågor, utmana, bjud in
4. Humor tillåtet och uppmuntrat – aldrig på andras bekostnad
5. Aktivt språk – undvik passiva konstruktioner
6. Varje text ska ha en tydlig poäng

### Budskapshierarki

- **Nivå 1 (hero):** "Vi ser framåt – Vad ser du?", "Bra, och lite läskigt – så ska rätt beslut kännas"
- **Nivå 2–3:** För artiklar och sociala medier

### Visuell identitet

- Organiska färger: #7D5365, #42504E, #555977, #756256, #7E7C83
- Gradient (energi): #FF6B0B → #FFB7F8 → #79F2FB
- Typsnitt: Manrope (fallback Arial)
- Logotyp: "forefront" i gemener, Manrope Semibold

## Miljövariabler (.env)

```
# LLM
ANTHROPIC_API_KEY=
IDEOGRAM_API_KEY=
PERPLEXITY_API_KEY=

# Slack
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=

# Supabase
SUPABASE_URL=                    # https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=       # Server-side nyckel (aldrig i frontend)
SUPABASE_ANON_KEY=               # Publik nyckel (används av Dashboard)

# MCP / Integrationer
WORDPRESS_URL=
WORDPRESS_API_KEY=
HUBSPOT_API_KEY=
LINKEDIN_ACCESS_TOKEN=
GA4_CREDENTIALS_PATH=
BUFFER_ACCESS_TOKEN=

# System
NODE_ENV=production
LOG_LEVEL=info
LOG_DIR=./logs
KNOWLEDGE_DIR=./knowledge
GATEWAY_API_PORT=3001            # Intern REST API-port (ej exponerad)
```

## Byggordning (fas 1 MVP)

Bygg i denna ordning. Varje steg ska fungera och vara testbart innan nästa påbörjas.

### Steg 1: Grundskelett

1. Initiera Node.js/TypeScript-projekt med package.json och tsconfig.json
2. Skapa src/index.ts som startar gatewayen
3. Skapa src/utils/config.ts – läser och validerar .env
4. Skapa src/gateway/logger.ts – strukturerad JSON-loggning till fil
5. Verifiera: Gateway startar, loggar "FIA Gateway started" till fil och stdout

### Steg 2: Supabase-uppsättning

1. Skapa Supabase-projekt (EU-region)
2. Skapa supabase/migrations/001_initial_schema.sql med alla sex tabeller + RLS
3. Skapa supabase/seed.sql med de sju agenterna
4. Skapa src/supabase/client.ts – initierar @supabase/supabase-js med service role key
5. Skapa src/supabase/heartbeat.ts – uppdaterar agents.last_heartbeat var 60s
6. Skapa src/supabase/activity-writer.ts – skriver till activity_log
7. Verifiera: Gateway skriver heartbeats till Supabase, synliga i Supabase Studio

### Steg 3: Slack-integration

1. Skapa src/slack/app.ts – Bolt SDK med Socket Mode
2. Skapa src/slack/commands.ts – /fia status och /fia kill
3. Skapa src/slack/handlers.ts – lyssna på meddelanden i #fia-orchestrator
4. Verifiera: Boten är online i Slack, svarar på /fia status

### Steg 4: LLM-klienter

1. Skapa src/llm/anthropic.ts – Claude Sonnet + Haiku med prompt caching
2. Skapa src/llm/types.ts – gemensamma typer
3. Skapa src/gateway/router.ts – routinglogik baserat på agent + uppgiftstyp
4. Verifiera: Kan skicka en prompt till Sonnet/Haiku och få svar

### Steg 5: Kontexthantering

1. Skapa knowledge/brand/platform.md (digitalisera varumärkesplattform)
2. Skapa knowledge/brand/tonality.md
3. Skapa src/context/context-manager.ts – läser markdown-filer
4. Skapa src/context/prompt-builder.ts – bygger systemprompt med kontext
5. Verifiera: Systemprompt innehåller varumärkeskontext, prompt caching aktiv

### Steg 6: Agent-ramverk

1. Skapa src/agents/base-agent.ts – abstrakt klass
2. Skapa src/agents/agent-loader.ts – läser SKILL.md
3. Skapa knowledge/agents/content/SKILL.md
4. Skapa src/agents/content/content-agent.ts
5. Koppla Content Agent till src/supabase/task-writer.ts – tasks skapas i Supabase
6. Verifiera: Content Agent genererar blogginlägg, task syns i Supabase

### Steg 7: Brand Agent

1. Skapa knowledge/agents/brand/SKILL.md med granskningskriterier
2. Skapa src/agents/brand/brand-agent.ts med godkänn/underkänn-logik
3. Implementera eskaleringskedja (3 avslag → Orchestrator)
4. Skapa src/supabase/task-writer.ts – uppdaterar task-status vid granskning
5. Verifiera: Brand Agent granskar, approval skrivs till Supabase, eskalerar korrekt

### Steg 8: REST API (Gateway-sidan)

1. Skapa src/api/server.ts – Express/Fastify med intern port
2. Skapa routes: agents, tasks, metrics, kill-switch
3. Skapa src/api/middleware/auth.ts – validerar JWT från Supabase
4. Skapa src/supabase/command-listener.ts – lyssnar på commands via Realtime
5. Verifiera: Kan pausa/godkänna via REST API-anrop (simulera Dashboard)

### Steg 9: Schemaläggning

1. Skapa src/gateway/scheduler.ts – node-cron
2. Koppla schemalagda uppgifter till agenter
3. Skapa src/utils/kill-switch.ts – dubbel: Slack + Supabase
4. Verifiera: Content Agent triggas på schema, kill switch pausar via båda gränssnitten

### Steg 10: WordPress MCP-wrapper

1. Skapa src/mcp/wordpress.ts – createDraft, publishPost
2. Koppla Content Agent → Brand Agent → WordPress-publicering
3. Verifiera: End-to-end – schemalagd bloggpost publiceras som utkast i WordPress

### Steg 11: FIA Dashboard MVP (parallellt – Lovable)

Dashboard byggs i Lovable (separat repo) och kopplas till samma Supabase-instans:

1. Auth (e-post + Google OAuth, inbjudningsbaserat)
2. Översiktssidan med agentpuls (läser agents.status och last_heartbeat) och nyckeltal
3. Agentlista med status (Supabase Realtime-prenumeration på agents-tabellen)
4. Godkännandekö med förhandsvy och godkänn/avslå (läser tasks + approvals, skriver via Edge Functions)
5. Grundläggande aktivitetslogg (läser activity_log)
6. Kill switch (anropar Gateway via Edge Function)
7. Responsiv design + PWA-installation
8. Verifiera: Orchestrator kan godkänna innehåll via Dashboard, status uppdateras i realtid

## Kommandon

```bash
# Utveckling
npm run dev          # ts-node med watch
npm run build        # TypeScript → JavaScript
npm run start        # Kör byggd version

# Produktion (PM2)
pm2 start ecosystem.config.js
pm2 status
pm2 logs fia
pm2 restart fia

# Tester
npm test             # Kör alla tester
npm run test:router  # Enbart routing-tester
npm run test:brand   # Enbart Brand Agent-tester
```

## Pågående arbete

- [ ] Fas 1: Gateway-skelett och Slack-integration
- [ ] Fas 1: Supabase-uppsättning (datamodell, RLS, seed, klient)
- [ ] Fas 1: LLM-klienter och modell-router
- [ ] Fas 1: Kontexthantering och varumärkeskontext
- [ ] Fas 1: Content Agent + Brand Agent (med Supabase task-skrivning)
- [ ] Fas 1: REST API (Gateway-sidan, för Dashboard-kommandon)
- [ ] Fas 1: WordPress MCP-wrapper
- [ ] Fas 1: Schemaläggning och kill switch (dual: Slack + Dashboard)
- [ ] Fas 1: FIA Dashboard MVP (Lovable – auth, agentpuls, godkännandekö, kill switch)
- [ ] Fas 1: 10 innehållsenheter producerade och granskade
- [ ] Fas 2: Strategy, Campaign, SEO, Lead, Analytics agenter
- [ ] Fas 2: LinkedIn, GA4, HubSpot MCP-wrappers
- [ ] Fas 2: Dashboard: rapportsida, agentdetalj, ledningsgrupp-vy, push-notifieringar
- [ ] Fas 2: Första agentdrivna kampanjen
