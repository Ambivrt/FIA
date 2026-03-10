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
- **LLM-primär:** Anthropic Claude API (Claude Opus 4.6 + Claude Sonnet 4.6)
- **LLM-bildgenerering:** Nano Banana 2 (Gemini 3.1 Flash Image) via Gemini API
- **Realtidssökning:** Serper API (Google search results)
- **Integrationer:** MCP-servrar (Slack, gws CLI, WordPress, HubSpot, LinkedIn)
- **Google Workspace:** gws CLI (@googleworkspace/cli) via MCP – enhetlig åtkomst till Drive, Gmail, Calendar, Sheets, Docs, GA4
- **Kunskapsbas:** Filbaserad (agent.yaml-manifest, markdown, JSON), ingen vektordatabas i v1
- **Kontext-hantering:** Manifest-driven via agent.yaml per agent (system_context, task_context, routing, tools, writable)
- **Loggning:** Strukturerad JSON (audit trail) + synk till Supabase
- **Process manager:** PM2
- **Hosting:** Google Cloud Platform (Compute Engine, EU-region, GDPR)
- **Databas-klient:** @supabase/supabase-js (skriver heartbeats, tasks, metrics, activity_log)
- **REST API:** Express / Fastify (intern, tar emot kommandon från Dashboard via Edge Functions)

### FIA Dashboard (separat repo – Lovable för POC/MVP)

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Deployment (POC/MVP):** Lovable hosting med custom domän (fia.forefront.se)
- **PWA:** Service worker för offline-stöd och installering på hemskärm
- **Realtid:** Supabase Realtime för live-uppdateringar av agentstatus
- **Diagram:** Recharts för KPI-visualiseringar
- **Notering:** Lovable används för snabb POC/MVP. Headless-arkitekturen säkerställer att frontend kan migreras till Vercel/Netlify/egen server utan kodändringar (se migrationsväg).

### Delad infrastruktur

- **Databas:** Supabase PostgreSQL (EU-region) – gemensam datakälla för Gateway och Dashboard
- **Auth:** Supabase Auth (e-post/lösenord + Google OAuth, Forefront-domän)
- **Realtid:** Supabase Realtime (postgres_changes) för live-uppdateringar

### LLM-modeller (Claude-first, multi-modell-routing)

| Modell | Användning i FIA | Pris (per 1M tokens) |
|--------|-------------------|----------------------|
| Claude Opus 4.6 | Primär: allt innehåll, strategi, analys, Brand Agent-granskning. Full varumärkeskontext i systemprompt. Överlägsen på nyanserad svensk text och varumärkesröst. | $15 in / $75 ut |
| Claude Sonnet 4.6 | Volymuppgifter: metadata, alt-texter, A/B-testvarianter, lead scoring, dataextraktion, klassificering | $3 in / $15 ut |
| Nano Banana 2 (Gemini 3.1 Flash Image) | Bildgenerering: social media-grafik, blogg-illustrationer, annonskreativ. Stark på text i bild, character consistency, 4K output. | ~$0.04/bild (Flash-nivå) |
| Serper API | Realtidssökning: omvärldsbevakning, trendspaning, SEO-analys, faktakontroll | $0.001/sökning |

**Routinglogik:** Varje agents agent.yaml definierar ett routing-fält som mappar uppgiftstyp till modell. Gatewayen läser detta vid laddning – ingen hårdkodning av modellval i kod.

**Claude-first-strategi:** Anthropic Claude är primär LLM-leverantör för alla text- och analysuppgifter. Gemini behålls enbart för bildgenerering (Nano Banana 2) då Claude saknar bildgenereringsförmåga.

**Claude-specifika fördelar:**

- **Nyanserad svensk text:** Opus 4.6 levererar konsekvent varumärkesröst med Forefronts tonalitet – modiga, hängivna, lustfyllda.
- **Instruktionsföljning:** Exceptionell på att följa komplexa guardrails och granskningskriterier (Brand Agent).
- **200K kontextfönster:** Tillräckligt för varumärkesplattform + historik + task_context i ett anrop.
- **Strukturerade outputs:** Pålitlig JSON-generering för metadata, scoring och rapporter.

**Gemini-roll (begränsad):** Nano Banana 2 (bildgenerering) via Gemini API. Gemini API-nyckel krävs fortfarande.

**Multi-modell-strategi:** Arkitekturen är modell-agnostisk. router.ts kan utökas med Gemini Pro/Flash eller OpenAI GPT som fallback/alternativ utan att ändra agentdefinitioner – enbart routing-fältet i agent.yaml behöver uppdateras.

### GCP-hosting

#### Varför GCP

- **Google-ekosystem:** Gemini API, gws CLI och Google Workspace finns redan på GCP – minimal latens och enkel autentisering via Service Account.
- **EU-region:** europe-north1 (Finland) för GDPR-compliance.
- **Skalbarhet:** Enkel uppgradering från Compute Engine till Cloud Run eller GKE om Gateway behöver skala.
- **IAM:** Centraliserad åtkomsthantering – Service Account per tjänst istället för manuella API-nycklar.

#### Compute Engine (FIA Gateway)

- **Maskintyp:** e2-small (2 vCPU, 2 GB RAM) – räcker för Node.js-daemon. Uppgradera till e2-medium vid behov.
- **Region:** europe-north1-b (Finland, EU)
- **OS:** Ubuntu 24 LTS
- **Disk:** 20 GB SSD (kunskapsbas + loggar)
- **Estimerad kostnad:** ~$15–25/mån (jämfört med Hetzner CX21 ~$5/mån – dyrare, men ekosystemfördelarna väger upp)
- **Firewall:** Enbart utgående trafik tillåten (Slack Socket Mode, Supabase, Anthropic API, Gemini API). Ingen inkommande exponering.

#### Autentisering och IAM

```
GCP-projekt: fia-forefront
├── Service Account: fia-gateway@fia-forefront.iam.gserviceaccount.com
│   ├── roles/aiplatform.user        (Gemini API / Vertex AI)
│   ├── roles/compute.instanceAdmin  (self-management)
│   └── roles/logging.logWriter      (Cloud Logging, valfritt)
└── Service Account: fia-gws@fia-forefront.iam.gserviceaccount.com
    └── Domain-Wide Delegation        (Google Workspace åtkomst via gws)
```

#### Alternativ: Vertex AI istället för Google AI Studio

För produktion kan Gemini-anrop göras via Vertex AI istället för Google AI Studio API:

- **Fördel:** Enterprise SLA, VPC Service Controls, audit logging via Cloud Logging
- **Nackdel:** Marginellt högre kostnad, mer komplex setup
- **Byte:** Ändra `GEMINI_API_KEY` till `GOOGLE_APPLICATION_CREDENTIALS` i `.env`, uppdatera `src/llm/gemini.ts` till Vertex-klienten

## Arkitekturprincip: Headless & Decoupled

### Grundregel

Frontenden (FIA Dashboard) och backenden (FIA API) är helt separerade system som kommunicerar uteslutande via ett dokumenterat REST API. Frontenden har noll kunskap om Gateway-internals, LLM-anrop, MCP-servrar eller agentlogik. Backenden har noll kunskap om hur frontenden renderar data.

```
┌──────────────────────────────────────────────────────────────┐
│                      FRONTEND (utbytbar)                      │
│                                                               │
│   Lovable / Vercel / Netlify / Cloudflare Pages / S3+CF      │
│   React + Vite + TypeScript + Tailwind + shadcn/ui            │
│                                                               │
│   Kommunicerar ENBART via:                                    │
│   1. FIA API (REST)  ← alla läs- och skriv-operationer       │
│   2. Supabase Auth   ← autentisering (JWT)                   │
│   3. Supabase Realtime ← live-prenumerationer (websocket)    │
└───────────────────────────┬───────────────────────────────────┘
                            │ HTTPS / WSS
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    FIA API (kontraktet)                        │
│                                                               │
│   Supabase Edge Functions (v1) → migreras till                │
│   Express/Fastify/Hono på valfri host (v2)                    │
│                                                               │
│   • Validerar JWT (Supabase Auth)                             │
│   • Kontrollerar roll (orchestrator/admin/viewer)             │
│   • Vidarebefordrar kommandon till Gateway                    │
│   • Läser/skriver Supabase PostgreSQL                         │
│   • Returnerar standardiserade JSON-svar                      │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    FIA Gateway (opåverkad)                     │
│                                                               │
│   Node.js daemon · Agentkluster · LLM-router · MCP           │
│   Gemini 2.5 Pro/Flash · Nano Banana 2 · Perplexity          │
│   GCP Compute Engine (europe-north1)                          │
│   Skriver heartbeats, tasks, metrics, activity_log            │
│   till Supabase PostgreSQL                                    │
└──────────────────────────────────────────────────────────────┘
```

### Ansvarsfördelning per lager

| Lager | Ansvarig för | Ansvarar INTE för |
|-------|-------------|-------------------|
| Frontend | Rendering, navigation, state management, UX, PWA, offline-cache | Affärslogik, validering av agentdata, autentiseringslogik (delegeras till API) |
| FIA API | Autentisering, auktorisering, datavalidering, affärslogik, Gateway-kommunikation | Rendering, layout, designbeslut |
| FIA Gateway | Agentexekvering, LLM-anrop, MCP-integrationer, schemaläggning | Användarhantering, UI, API-exponering direkt |

### Regler för frontenden

1. **Noll direkt databasåtkomst för skrivoperationer.** All mutation (godkänn, pausa, kill switch) går via FIA API:t. Frontenden anropar aldrig Supabase direkt för INSERT/UPDATE/DELETE.
2. **Läsning via Supabase-klienten är tillåtet** för realtid och initiala data-hämtningar (SELECT). RLS skyddar data.
3. **Alla API-anrop via ett centralt servicelager** (`src/services/fia-api.ts`). Inga fetch-anrop direkt i komponenter.
4. **Miljövariabler för alla URL:er.** `VITE_FIA_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Byta host = byta env-variabler.
5. **Ingen Lovable-specifik kod.** Inga Lovable-SDK-anrop, inga Lovable-specifika hooks. Standard React, standard Supabase-klient.

### Migrationsväg

| Fas | Host | Vad som krävs |
|-----|------|---------------|
| MVP | Lovable hosting | Bygg i Lovable, deploya med custom domän |
| V2 | Vercel/Netlify | git push till GitHub, koppla ny host, uppdatera DNS + env-variabler |
| V3 | Egen server | `npm run build` → statiska filer → Nginx/Caddy, samma env-variabler |

Migrationen kräver: (1) flytta Git-repot, (2) sätta env-variabler hos ny host, (3) peka DNS. Noll kodändringar.

#### Portabilitetstest

```bash
# Verifiera att frontenden fungerar utan Lovable
git clone <lovable-repo-url> fia-dashboard
cd fia-dashboard
npm install
echo "VITE_FIA_API_URL=https://fia-api.forefront.se" > .env
echo "VITE_SUPABASE_URL=https://xxxx.supabase.co" >> .env
echo "VITE_SUPABASE_ANON_KEY=eyJ..." >> .env
npm run build
npx serve dist
# Om allt fungerar identiskt är frontenden portabel.
```

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
│   │   ├── agent-loader.ts      # Läser agent.yaml och bygger systemprompt
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
│   │   ├── gemini.ts            # Gemini 2.5 Pro/Flash-klient med context caching
│   │   ├── nano-banana.ts       # Nano Banana 2 bildgenerering (Gemini 3.1 Flash Image)
│   │   ├── perplexity.ts        # Realtidssökning (Sonar API)
│   │   └── types.ts             # Gemensamma LLM-typer
│   │
│   ├── mcp/
│   │   ├── mcp-client.ts        # Generisk MCP-klientklass
│   │   ├── wordpress.ts         # WordPress MCP-wrapper (fas 1) (KRITISK)
│   │   ├── hubspot.ts           # HubSpot MCP-wrapper (fas 2)
│   │   ├── linkedin.ts          # LinkedIn API MCP-wrapper (fas 2)
│   │   └── buffer.ts            # Buffer/social media MCP-wrapper (fas 2)
│   │   # OBS: Google Workspace (Gmail, Calendar, Drive, Sheets, Docs, GA4)
│   │   # hanteras av gws CLI som MCP-server – ingen custom wrapper behövs
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
│   ├── brand/                   # Delad varumärkeskontext (prompt-cachas)
│   │   ├── platform.md          # Varumärkesplattform
│   │   ├── tonality.md          # Tonalitetsregler och exempel
│   │   ├── visual.md            # Visuell identitet
│   │   └── messages.md          # Budskapshierarki nivå 1–3
│   ├── agents/                  # Agentspecifik kontext (manifest-driven)
│   │   ├── strategy/
│   │   │   ├── agent.yaml       # Manifest: routing, tools, autonomi, writable
│   │   │   ├── SKILL.md         # Roll, mål, guardrails
│   │   │   ├── context/
│   │   │   │   ├── planning-framework.md
│   │   │   │   └── templates/   # quarterly-plan.md, monthly-plan.md, campaign-brief.md
│   │   │   └── memory/          # campaign-history.json (skrivbar)
│   │   ├── content/
│   │   │   ├── agent.yaml
│   │   │   ├── SKILL.md
│   │   │   ├── context/
│   │   │   │   ├── tone-examples.md
│   │   │   │   ├── templates/   # blog-post.md, linkedin-post.md, newsletter.md, case-study.md, whitepaper.md
│   │   │   │   └── few-shot/    # blog-good.md, blog-bad.md, linkedin-good.md, linkedin-bad.md
│   │   │   ├── memory/          # learnings.json, feedback-log.json (skrivbar)
│   │   │   └── assets/          # image-style-guide.md
│   │   ├── campaign/
│   │   │   ├── agent.yaml
│   │   │   ├── SKILL.md
│   │   │   ├── context/
│   │   │   │   ├── templates/   # email-sequence.md, ad-copy.md, landing-page.md
│   │   │   │   └── few-shot/    # campaign-good.md
│   │   │   └── memory/          # ab-test-results.json (skrivbar)
│   │   ├── seo/
│   │   │   ├── agent.yaml
│   │   │   ├── SKILL.md
│   │   │   ├── context/
│   │   │   │   ├── geo-guidelines.md
│   │   │   │   └── templates/   # seo-audit.md
│   │   │   └── memory/          # keyword-rankings.json, opportunities.json (skrivbar)
│   │   ├── lead/
│   │   │   ├── agent.yaml
│   │   │   ├── SKILL.md
│   │   │   ├── context/
│   │   │   │   └── templates/   # nurture-email.md, scoring-rules.md
│   │   │   └── memory/          # scoring-calibration.json (skrivbar)
│   │   ├── analytics/
│   │   │   ├── agent.yaml
│   │   │   ├── SKILL.md
│   │   │   ├── context/
│   │   │   │   └── templates/   # morning-pulse.md, weekly-report.md, quarterly-review.md
│   │   │   └── memory/          # baseline-metrics.json (skrivbar)
│   │   └── brand/
│   │       ├── agent.yaml
│   │       ├── SKILL.md
│   │       ├── context/
│   │       │   ├── review-checklist.md
│   │       │   └── few-shot/    # review-approved.md, review-rejected.md
│   │       └── memory/          # rejection-patterns.json (skrivbar)
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

### Modell-routing (KRITISK – manifest-driven)

Routern bestämmer vilken LLM som hanterar varje uppgift. Felaktig routing = fel modell = fel resultat. Routing definieras i varje agents agent.yaml – ingen hårdkodning av modellval i kod. Gatewayen läser routing-fältet vid laddning.

Referenstabell (härlett från agent.yaml-manifesten):

| Agent | Uppgift | Modell |
|-------|---------|--------|
| Content Agent | Alla texter, kopia | Claude Opus 4.6 |
| Content Agent | Metadata, alt-texter, A/B-varianter | Claude Sonnet 4.6 |
| Content Agent | Bildgenerering | Nano Banana 2 |
| Brand Agent | All granskning | Claude Opus 4.6 (alltid) |
| Strategy Agent | Planering, ramverk | Claude Opus 4.6 |
| Strategy Agent | Research, omvärldsbevakning | Serper (Google Search) |
| Campaign Agent | Kampanjstrategi, slutgiltig kopia | Claude Opus 4.6 |
| Campaign Agent | A/B-varianter, segmentering | Claude Sonnet 4.6 |
| SEO Agent | Sökanalys, trendspaning | Serper (Google Search) |
| SEO Agent | Bulkoptimering | Claude Sonnet 4.6 |
| SEO Agent | Innehållsrekommendationer | Claude Opus 4.6 |
| Lead Agent | Scoring, klassificering | Claude Sonnet 4.6 |
| Lead Agent | Nurture-sekvenser | Claude Opus 4.6 |
| Analytics Agent | Dataextraktion | Claude Sonnet 4.6 |
| Analytics Agent | Insikter, rapportskrivning | Claude Opus 4.6 |

### Context caching

Använd Gemini API:ts context caching på varumärkeskontexten (platform.md, tonality.md etc.) som läggs i systempromptens statiska del. Cachade kontexter har 1 timmes TTL som standard och reducerar kostnaden för upprepade anrop med ~75%.

### Loggning (KRITISK – granska manuellt)

Varje agentbeslut loggas med:

```json
{
  "timestamp": "ISO-8601",
  "agent": "content",
  "task_id": "uuid",
  "model": "gemini-2.5-pro-preview-06-05",
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

### MCP-integrationer

#### Google Workspace CLI (gws) – enhetlig Google-integration

Alla Google Workspace-integrationer hanteras via gws (@googleworkspace/cli) – Googles officiella CLI som exponerar hela Workspace som MCP-server. gws bygger sin kommandoyta dynamiskt via Googles Discovery Service – nya API-endpoints plockas upp automatiskt utan kodändringar.

**Installation:**

```bash
npm install -g @googleworkspace/cli
gws auth setup     # Skapar GCP-projekt, aktiverar API:er, OAuth-inloggning
```

**MCP-konfiguration i Gateway:**

```json
{
  "mcpServers": {
    "gws": {
      "command": "gws",
      "args": ["mcp", "-s", "drive,gmail,calendar,sheets,analytics,docs"]
    }
  }
}
```

`-s`-flaggan begränsar till enbart de tjänster FIA behöver. Varje agent exponeras enbart för de gws-tjänster som definieras i dess agent.yaml (`tools`-fältet). Formatet `gws:<tjänst>` refererar till specifika tjänster.

**Exempel på agentanvändning:**

```bash
# Analytics Agent – hämta GA4-data
gws analytics data runReport --json '{"property": "properties/123", "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}]}'

# Content Agent – skapa Google Docs-utkast
gws docs documents create --json '{"title": "Blogginlägg: AI i marknadsföring"}'

# Strategy Agent – läsa kampanjkalender
gws calendar events list --params '{"calendarId": "fia-kampanjer@forefront.se", "timeMin": "2026-03-01T00:00:00Z"}'
```

**Vad gws ersätter:** De tidigare planerade custom MCP-wrappers för Gmail, Google Calendar och GA4 (`src/mcp/ga4.ts`) samt de separata Anthropic MCP-servrarna för Gmail och Calendar. En `gws mcp`-process ersätter samtliga.

**Vad gws INTE ersätter:** WordPress, HubSpot och LinkedIn saknar Discovery Service-stöd och kräver fortfarande dedikerade integrationer.

**gws-autentisering i produktion (headless-flöde):**

1. Kör `gws auth setup` på en maskin med webbläsare (engångsuppgift)
2. Exportera credentials: `gws auth export --unmasked > credentials.json`
3. På Compute Engine: `export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/path/to/credentials.json`
4. Alternativt: Service Account med Domain-Wide Delegation för Forefronts domän (rekommenderat på GCP)

**Versionshantering:** gws är pre-v1.0. Mitigering: pinna version i package.json, wrappa alla anrop i try/catch, fallback på googleapis npm-paketet vid gws-fel, testa uppdateringar i staging innan deploy.

#### MCP-servrar – komplett översikt

| System | Integration | Status |
|--------|-------------|--------|
| Google Workspace | gws CLI (MCP-server) | Klar – fas 1 |
| — Gmail | via `gws mcp -s gmail` | Klar – fas 1 |
| — Google Calendar | via `gws mcp -s calendar` | Klar – fas 1 |
| — Google Drive | via `gws mcp -s drive` | Klar – fas 1 |
| — Google Sheets | via `gws mcp -s sheets` | Klar – fas 1 |
| — Google Docs | via `gws mcp -s docs` | Klar – fas 1 |
| — Google Analytics 4 | via `gws mcp -s analytics` | Klar – fas 1 |
| Slack | MCP-server (Anthropic) | Klar |
| WordPress | Custom MCP-wrapper | Byggs i fas 1 |
| HubSpot CRM | Community MCP | Finns, behöver valideras |
| LinkedIn API | Custom MCP-wrapper | Byggs i fas 2 |
| Buffer/Hootsuite | Custom MCP-wrapper | Byggs i fas 2 |

#### Övriga MCP-wrappers (KRITISK – granska manuellt)

För system utan gws-stöd skrivs tunna TypeScript-wrappers (50–200 rader per integration). Principen "minsta möjliga rättighet":

- **WordPress:** createDraft, publishPost, updatePost, getPost
- **HubSpot:** createContact, updateContact, getContacts, updateDeal
- **LinkedIn:** createPost, getAnalytics
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
  model_used text,                        -- gemini-pro | gemini-flash | nano-banana-2 | perplexity
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

Dashboarden kommunicerar med Gateway via Edge Functions i Supabase som proxy. REST API:t exponeras INTE mot internet.

#### Autentisering

Alla anrop kräver header `Authorization: Bearer <supabase-jwt>`. API:t validerar token mot Supabase Auth och extraherar user.id + role från profiles-tabellen.

#### Felformat (standardiserat)

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Rollen 'viewer' har inte behörighet att pausa agenter."
  }
}
```

HTTP-statuskoder: 200 (ok), 201 (skapad), 400 (validering), 401 (ej autentiserad), 403 (ej auktoriserad), 404 (ej hittad), 500 (serverfel).

#### Agenter

**GET /api/agents** – Alla inloggade.

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Content Agent",
      "slug": "content",
      "status": "active",
      "autonomy_level": "autonomous",
      "last_heartbeat": "2025-03-04T08:42:00Z",
      "tasks_today": { "queued": 2, "in_progress": 1, "completed": 5 }
    }
  ]
}
```

**POST /api/agents/:slug/pause** – Orchestrator, Admin.
**POST /api/agents/:slug/resume** – Orchestrator, Admin.
**PUT /api/agents/:slug/config** – Admin. Body: `{ "config_json": { ... } }`

#### Uppgifter

**GET /api/tasks** – Alla inloggade. Query params: `status`, `agent_slug`, `type`, `priority`, `page`, `per_page` (default 50), `sort` (default `-created_at`)

```json
{
  "data": [ { "id": "uuid", "title": "...", "status": "awaiting_review", "..." : "..." } ],
  "meta": { "total": 142, "page": 1, "per_page": 50 }
}
```

**GET /api/tasks/:id** – Alla inloggade. Returnerar task med content_json och alla relaterade approvals.

**POST /api/tasks/:id/approve** – Orchestrator, Admin. Body: `{ "feedback": "Valfri" }` (optional)
**POST /api/tasks/:id/reject** – Orchestrator, Admin. Body: `{ "feedback": "Motivering" }` (obligatoriskt)
**POST /api/tasks/:id/revision** – Orchestrator, Admin. Body: `{ "feedback": "Vad som behöver ändras" }`

#### Metrics

**GET /api/metrics** – Alla inloggade. Query params: `category` (content/traffic/leads/cost/brand), `period` (daily/weekly/monthly), `from`, `to`

**GET /api/metrics/summary** – Alla inloggade. Förberäknad sammanfattning för dashboard-KPI-korten.

```json
{
  "data": {
    "content_this_week": 14,
    "approval_rate": 0.87,
    "pending_approvals": 3,
    "cost_mtd_sek": 4230,
    "cost_trend": -0.12,
    "leads_this_month": 28
  }
}
```

#### Aktivitetslogg

**GET /api/activity** – Alla inloggade. Query params: `agent_slug`, `action`, `from`, `to`, `search`, `page`, `per_page`

#### Kill switch

**POST /api/kill-switch** – Orchestrator, Admin. Body: `{ "action": "activate" | "deactivate" }`
**GET /api/kill-switch/status** – Alla inloggade.

```json
{ "data": { "active": false, "activated_at": null, "activated_by": null } }
```

### Dashboard – Frontend-servicelager

Dashboarden använder ett centralt servicelager (`src/services/fia-api.ts`) som wrappas av React Query hooks. Ingen komponent anropar fetch direkt.

```typescript
// src/services/fia-api.ts – princip
const API_URL = import.meta.env.VITE_FIA_API_URL;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const session = await supabase.auth.getSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.data.session?.access_token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new ApiError(await res.json());
  return res.json();
}

export const fiaApi = {
  agents: {
    list: () => request<AgentsResponse>('/api/agents'),
    pause: (slug: string) => request(`/api/agents/${slug}/pause`, { method: 'POST' }),
    resume: (slug: string) => request(`/api/agents/${slug}/resume`, { method: 'POST' }),
  },
  tasks: {
    list: (params: TaskFilters) => request<TasksResponse>(`/api/tasks?${qs(params)}`),
    get: (id: string) => request<TaskResponse>(`/api/tasks/${id}`),
    approve: (id: string, feedback?: string) =>
      request(`/api/tasks/${id}/approve`, { method: 'POST', body: JSON.stringify({ feedback }) }),
    reject: (id: string, feedback: string) =>
      request(`/api/tasks/${id}/reject`, { method: 'POST', body: JSON.stringify({ feedback }) }),
    revision: (id: string, feedback: string) =>
      request(`/api/tasks/${id}/revision`, { method: 'POST', body: JSON.stringify({ feedback }) }),
  },
  metrics: {
    list: (params: MetricFilters) => request<MetricsResponse>(`/api/metrics?${qs(params)}`),
    summary: () => request<MetricsSummaryResponse>('/api/metrics/summary'),
  },
  activity: {
    list: (params: ActivityFilters) => request<ActivityResponse>(`/api/activity?${qs(params)}`),
  },
  killSwitch: {
    status: () => request<KillSwitchResponse>('/api/kill-switch/status'),
    activate: () => request('/api/kill-switch', { method: 'POST', body: JSON.stringify({ action: 'activate' }) }),
    deactivate: () => request('/api/kill-switch', { method: 'POST', body: JSON.stringify({ action: 'deactivate' }) }),
  },
};
```

### Dashboard miljövariabler

```
VITE_FIA_API_URL=https://fia-api.forefront.se
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

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

Varje agent definieras av en mapphierarki under `knowledge/agents/<slug>/` med ett `agent.yaml`-manifest som styr konfiguration, modellval, kontextladdning och guardrails. Gateway läser manifestet via `agent-loader.ts` och konstruerar systemprompt + verktygskontext dynamiskt.

### agent.yaml – manifestformat

```yaml
name: Content Agent
slug: content
version: 1.2.0

# Modellval per uppgiftstyp (styr routern – ingen hårdkodning i kod)
routing:
  default: claude-opus
  metadata: claude-sonnet
  alt_text: claude-sonnet
  ab_variants: claude-sonnet
  images: nano-banana-2

# Filer som alltid laddas i systemprompt (ordning spelar roll, prompt-cachas)
system_context:
  - SKILL.md
  - context/tone-examples.md

# Filer som laddas on-demand baserat på uppgiftstyp (sparar tokens)
task_context:
  blog_post:
    - context/templates/blog-post.md
    - context/few-shot/blog-good.md
    - context/few-shot/blog-bad.md
  linkedin:
    - context/templates/linkedin-post.md
  newsletter:
    - context/templates/newsletter.md

# MCP-verktyg denna agent har tillgång till
tools:
  - wordpress
  - buffer
  - gws:drive
  - gws:docs

# Autonomi och guardrails
autonomy: autonomous
escalation_threshold: 3       # Avslag innan eskalering till Orchestrator
sample_review_rate: 0.2       # 1 av 5 stickprovas av Orchestrator

# Filer agenten kan skriva till (ackumulerat minne)
writable:
  - memory/learnings.json
  - memory/feedback-log.json
```

### Designprinciper för agentkontext

- **system_context** laddas alltid och context-cachas via Gemini API. Håll det kompakt – roll, guardrails, tonalitetsexempel.
- **task_context** laddas enbart vid matchande uppgiftstyp. Mallar, few-shot och tyngre referensmaterial utan att belasta varje anrop.
- **routing** definierar vilken LLM som hanterar varje uppgiftstyp. Routern läser detta fält – ingen hårdkodning.
- **writable** anger vilka filer agenten får uppdatera under körning. Allt annat är skrivskyddat. Memory-filer versionshanteras, men agenten kan appenda lärdomar och feedback mellan körningar.
- **tools** listar MCP-servrar och gws-tjänster. Principen "minsta möjliga rättighet" – en agent som inte behöver WordPress har inte access till WordPress. Formatet `gws:<tjänst>` refererar till specifika tjänster exponerade via `gws mcp -s <tjänst>`.

### Agent-loader-flöde (src/agents/agent-loader.ts)

1. Läser `knowledge/agents/{slug}/agent.yaml`
2. Resolvar alla filsökvägar relativt agentmappen
3. Laddar system_context-filer → kombinerar med delad varumärkeskontext → bygger systemprompt
4. Vid uppgiftsexekvering: laddar matchande task_context och appendar till prompten
5. Läser routing → skickar till modell-routern
6. Registrerar tools → konfigurerar MCP-access
7. Efter exekvering: om agenten producerar lärdomar, skriver till filer i writable

### BaseAgent-kontrakt

```typescript
abstract class BaseAgent {
  abstract name: string;
  abstract slug: string;
  abstract manifest: AgentManifest;  // Parsad agent.yaml

  // Kör agenten med given uppgift
  abstract execute(task: AgentTask): Promise<AgentResult>;

  // Hämta systemprompt (system_context + varumärkeskontext, prompt-cachad)
  getSystemPrompt(): string;

  // Hämta task-kontext baserat på uppgiftstyp
  getTaskContext(taskType: string): string;

  // Logga agentbeslut
  log(entry: LogEntry): void;

  // Eskalera till Orchestrator via Slack
  escalate(reason: string, context: any): Promise<void>;

  // Skriv till memory-filer (enbart writable-paths)
  writeMemory(path: string, data: any): void;
}
```

### Agentflöde

```
Trigger (cron/Slack/annan agent)
  → Gateway tar emot
  → Agent-loader läser agent.yaml
  → Router läser routing-fält → bestämmer modell
  → Agent laddar system_context + task_context + varumärkeskontext
  → Agent exekverar uppgift (LLM-anrop)
  → Brand Agent granskar output (om publicering)
  → Godkänt → Publicera via MCP / leverera via Slack
  → Underkänt → Tillbaka till agent med feedback
  → 3x underkänt → Eskalera till Orchestrator
  → Agent skriver eventuella lärdomar till memory/
```

### Alla sju agenter – agent.yaml-definitioner

#### Agent 1: Strategy Agent

```yaml
name: Strategy Agent
slug: strategy
version: 1.0.0
routing:
  default: claude-opus
  research: google-search
  trend_analysis: google-search
system_context:
  - SKILL.md
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

- **Trigger:** Kvartalsvis (manuell), månadsvis (schedulerad), vid Orchestrator-instruktion
- **Guardrail:** Alla planer kräver Orchestrator-godkännande (sample_review_rate: 1.0)

#### Agent 2: Content Agent

```yaml
name: Content Agent
slug: content
version: 1.0.0
routing:
  default: claude-opus
  metadata: claude-sonnet
  alt_text: claude-sonnet
  ab_variants: claude-sonnet
  images: nano-banana-2
system_context: [SKILL.md, context/tone-examples.md]
task_context:
  blog_post: [context/templates/blog-post.md, context/few-shot/blog-good.md, context/few-shot/blog-bad.md]
  linkedin: [context/templates/linkedin-post.md, context/few-shot/linkedin-good.md, context/few-shot/linkedin-bad.md]
  newsletter: [context/templates/newsletter.md]
  case_study: [context/templates/case-study.md]
  whitepaper: [context/templates/whitepaper.md]
tools: [wordpress, buffer, gws:drive, gws:docs]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.2
writable: [memory/learnings.json, memory/feedback-log.json]
```

- **Guardrail:** Alla texter passerar Brand Agent. Few-shot-exempel kalibrerar kvalitet.

#### Agent 3: Campaign Agent

```yaml
name: Campaign Agent
slug: campaign
version: 1.0.0
routing:
  default: claude-opus
  ab_variants: claude-sonnet
  segmentation: claude-sonnet
system_context: [SKILL.md]
task_context:
  email_sequence: [context/templates/email-sequence.md]
  ad_copy: [context/templates/ad-copy.md, context/few-shot/campaign-good.md]
  landing_page: [context/templates/landing-page.md]
tools: [hubspot, linkedin, buffer]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.33
budget_limit_sek: 10000
writable: [memory/ab-test-results.json]
```

- **Guardrail:** `budget_limit_sek` per kampanj, automatisk paus vid överskridande.

#### Agent 4: SEO Agent

```yaml
name: SEO Agent
slug: seo
version: 1.0.0
routing:
  default: perplexity
  bulk_optimization: claude-sonnet
  content_recommendations: claude-opus
system_context: [SKILL.md, context/geo-guidelines.md]
task_context:
  seo_audit: [context/templates/seo-audit.md]
tools: [gws:analytics, gws:sheets, wordpress]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.0
writable: [memory/keyword-rankings.json, memory/opportunities.json]
```

- **Memory:** Keyword-rankings ackumuleras för trendanalys.

#### Agent 5: Lead Agent

```yaml
name: Lead Agent
slug: lead
version: 1.0.0
routing:
  default: claude-sonnet
  nurture_sequences: claude-opus
system_context: [SKILL.md, context/templates/scoring-rules.md]
task_context:
  nurture_email: [context/templates/nurture-email.md]
tools: [hubspot]
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.0
score_threshold_mql: 75
writable: [memory/scoring-calibration.json]
```

- **Guardrail:** `score_threshold_mql` definierar MQL-gräns.

#### Agent 6: Analytics Agent

```yaml
name: Analytics Agent
slug: analytics
version: 1.0.0
routing:
  default: claude-sonnet
  insights: claude-opus
  report_writing: claude-opus
system_context: [SKILL.md]
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

- **Dashboard-integration:** Skriver KPI-data till Supabase per period. Morgonrapport cachas och renderas på Översiktssidan.

#### Agent 7: Brand Agent

```yaml
name: Brand Agent
slug: brand
version: 1.0.0
routing:
  default: claude-opus
system_context: [SKILL.md, context/review-checklist.md, context/few-shot/review-approved.md, context/few-shot/review-rejected.md]
task_context: {}
tools: []
autonomy: autonomous
escalation_threshold: 3
sample_review_rate: 0.0
has_veto: true
writable: [memory/rejection-patterns.json]
```

- **Guardrail:** `has_veto: true` – vetorätt. Tre avslag i rad eskalerar automatiskt. Rejection-patterns identifierar återkommande kvalitetsbrister.
- **Notering:** Använder alltid Claude Opus 4.6 – tonalitetsgranskning kräver full språkförståelse och nyanserad varumärkesröst.

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
- Principen "minsta möjliga rättighet" per MCP-wrapper och per gws-tjänst (varje agent exponeras enbart för de tjänster som definieras i dess agent.yaml).
- gws CLI-credentials hanteras via GCP Service Account med Domain-Wide Delegation (rekommenderat) eller exporterad fil på Compute Engine.
- All data stannar inom EU (GCP europe-north1 datacenter, EU-baserad Supabase-instans).
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
# LLM (Google Gemini)
GEMINI_API_KEY=                  # Google AI Studio API-nyckel
# Alternativt för Vertex AI:
# GOOGLE_CLOUD_PROJECT=
# GOOGLE_APPLICATION_CREDENTIALS=
PERPLEXITY_API_KEY=

# Slack
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=

# Supabase
SUPABASE_URL=                    # https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=       # Server-side nyckel (aldrig i frontend)
SUPABASE_ANON_KEY=               # Publik nyckel (används av Dashboard)

# Google Workspace CLI
GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=  # Sökväg till exporterad credentials.json

# MCP / Integrationer
WORDPRESS_URL=
WORDPRESS_API_KEY=
HUBSPOT_API_KEY=
LINKEDIN_ACCESS_TOKEN=
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

1. Skapa src/llm/gemini.ts – Gemini 2.5 Pro + Flash med context caching via @google/genai SDK
2. Skapa src/llm/nano-banana.ts – Nano Banana 2 (Gemini 3.1 Flash Image) för bildgenerering
3. Skapa src/llm/types.ts – gemensamma typer
4. Skapa src/gateway/router.ts – routinglogik baserat på agent.yaml routing-fält
5. Verifiera: Kan skicka en prompt till Gemini Pro/Flash och få svar, kan generera en bild med Nano Banana 2

### Steg 5: Kontexthantering

1. Skapa knowledge/brand/platform.md (digitalisera varumärkesplattform)
2. Skapa knowledge/brand/tonality.md
3. Skapa src/context/context-manager.ts – läser markdown-filer
4. Skapa src/context/prompt-builder.ts – bygger systemprompt med kontext
5. Verifiera: Systemprompt innehåller varumärkeskontext, Gemini context caching aktiv

### Steg 6: Agent-ramverk (manifest-driven)

1. Skapa src/agents/base-agent.ts – abstrakt klass med manifest-stöd
2. Skapa src/agents/agent-loader.ts – läser agent.yaml, resolvar filsökvägar, laddar system_context + task_context
3. Skapa knowledge/agents/content/agent.yaml med routing, tools, system_context, task_context, writable
4. Skapa knowledge/agents/content/SKILL.md, context/tone-examples.md, context/templates/, context/few-shot/
5. Skapa src/agents/content/content-agent.ts
6. Koppla Content Agent till src/supabase/task-writer.ts – tasks skapas i Supabase
7. Verifiera: Agent-loader parsar agent.yaml, Content Agent genererar blogginlägg med korrekt task_context, task syns i Supabase

### Steg 7: Brand Agent

1. Skapa knowledge/agents/brand/agent.yaml med has_veto: true, review-checklist och few-shot i system_context
2. Skapa knowledge/agents/brand/SKILL.md, context/review-checklist.md, context/few-shot/review-approved.md, context/few-shot/review-rejected.md
3. Skapa src/agents/brand/brand-agent.ts med godkänn/underkänn-logik
4. Implementera eskaleringskedja (3 avslag → Orchestrator)
5. Skapa src/supabase/task-writer.ts – uppdaterar task-status vid granskning
6. Verifiera: Brand Agent granskar, approval skrivs till Supabase, eskalerar korrekt

### Steg 8: Google Workspace CLI (gws)

1. Installera gws: `npm install -g @googleworkspace/cli`
2. Kör `gws auth setup` på maskin med webbläsare, exportera credentials till VPS
3. Konfigurera `gws mcp -s drive,gmail,calendar,sheets,analytics,docs` som MCP-server i Gateway
4. Verifiera: Content Agent kan skapa Google Docs-utkast via gws:docs, Analytics Agent kan hämta GA4-data via gws:analytics

### Steg 9: REST API (Gateway-sidan)

1. Skapa src/api/server.ts – Express/Fastify med intern port
2. Skapa routes: agents, tasks, metrics, kill-switch
3. Skapa src/api/middleware/auth.ts – validerar JWT från Supabase
4. Skapa src/supabase/command-listener.ts – lyssnar på commands via Realtime
5. Verifiera: Kan pausa/godkänna via REST API-anrop (simulera Dashboard)

### Steg 10: Schemaläggning

1. Skapa src/gateway/scheduler.ts – node-cron
2. Koppla schemalagda uppgifter till agenter
3. Skapa src/utils/kill-switch.ts – dubbel: Slack + Supabase
4. Verifiera: Content Agent triggas på schema, kill switch pausar via båda gränssnitten

### Steg 11: WordPress MCP-wrapper

1. Skapa src/mcp/wordpress.ts – createDraft, publishPost
2. Koppla Content Agent → Brand Agent → WordPress-publicering
3. Verifiera: End-to-end – schemalagd bloggpost publiceras som utkast i WordPress

### Steg 12: FIA Dashboard MVP (parallellt – Lovable)

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
