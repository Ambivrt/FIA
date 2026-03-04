# FIA – Forefront Intelligent Automation

## Projektöversikt

FIA är en persistent, always-on AI-agentgateway som ersätter Forefronts marknadsavdelning. Sju specialiserade agentkluster utför allt operativt marknadsarbete. 1–2 människor ("Marketing Orchestrators") styr via Slack – de sätter riktning och godkänner, men utför inte det operativa arbetet.

**Princip:** Human on the loop – agenter beslutar och exekverar inom definierade ramar.

## Teknikstack

- **Runtime:** Node.js (persistent daemon via PM2)
- **Språk:** TypeScript
- **Meddelandegränssnitt:** Slack API (Bolt SDK, Socket Mode)
- **Schemaläggning:** node-cron
- **LLM-primär:** Anthropic API (Claude Sonnet 4.5 + Haiku 4.5)
- **Bildgenerering:** Ideogram 3.0 API
- **Realtidssökning:** Perplexity Sonar API
- **Integrationer:** MCP-servrar (Slack, Gmail, Google Calendar, WordPress, HubSpot, LinkedIn, GA4)
- **Kunskapsbas:** Filbaserad (markdown + JSON), ingen vektordatabas i v1
- **Loggning:** Strukturerad JSON (audit trail)
- **Process manager:** PM2
- **Hosting:** Hetzner VPS (Ubuntu 24 LTS, EU/GDPR)

## Projektstruktur

```
fia/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── ecosystem.config.js
│
├── src/
│   ├── index.ts
│   ├── gateway/
│   │   ├── gateway.ts
│   │   ├── scheduler.ts
│   │   ├── router.ts            # KRITISK – granska manuellt
│   │   └── logger.ts            # KRITISK
│   │
│   ├── slack/
│   │   ├── app.ts
│   │   ├── commands.ts
│   │   ├── handlers.ts
│   │   └── channels.ts
│   │
│   ├── agents/
│   │   ├── base-agent.ts
│   │   ├── agent-loader.ts
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
│   │       └── brand-agent.ts
│   │
│   ├── llm/
│   │   ├── anthropic.ts
│   │   ├── ideogram.ts
│   │   ├── perplexity.ts
│   │   └── types.ts
│   │
│   ├── mcp/
│   │   ├── mcp-client.ts
│   │   ├── wordpress.ts         # KRITISK
│   │   ├── hubspot.ts
│   │   ├── linkedin.ts
│   │   ├── ga4.ts
│   │   └── buffer.ts
│   │
│   ├── context/
│   │   ├── context-manager.ts
│   │   └── prompt-builder.ts
│   │
│   └── utils/
│       ├── config.ts
│       ├── errors.ts
│       └── kill-switch.ts
│
├── knowledge/
│   ├── brand/
│   │   ├── platform.md
│   │   ├── tonality.md
│   │   ├── visual.md
│   │   └── messages.md
│   ├── agents/
│   │   ├── strategy/SKILL.md
│   │   ├── content/SKILL.md
│   │   ├── campaign/SKILL.md
│   │   ├── seo/SKILL.md
│   │   ├── lead/SKILL.md
│   │   ├── analytics/SKILL.md
│   │   └── brand/SKILL.md
│   ├── content/
│   │   └── archive/
│   └── campaigns/
│
├── logs/                        # gitignored
│
└── tests/
    ├── router.test.ts
    ├── brand-agent.test.ts
    ├── logger.test.ts
    └── mcp/
        └── wordpress.test.ts
```

## Viktiga konventioner

### Kodstil

- TypeScript strict mode
- Async/await överallt (inga callbacks)
- Explicit typer på alla publika funktioner
- Felhantering: alla LLM-anrop wrappas i try/catch med strukturerad loggning
- Inga beroenden på externa agent-ramverk – vi bygger tunt och kontrollerat

### Modell-routing (KRITISK – granska manuellt)

Routern bestämmer vilken LLM som hanterar varje uppgift. Felaktig routing = fel modell = fel resultat.

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

Tunna TypeScript-wrappers (50–200 rader per integration) som exponerar minsta möjliga operationer:

- **WordPress:** createDraft, publishPost, updatePost, getPost
- **HubSpot:** createContact, updateContact, getContacts, updateDeal
- **LinkedIn:** createPost, getAnalytics
- **GA4:** getReport, getRealtimeData
- **Buffer:** createPost, schedulePost, getAnalytics

## Agent-arkitektur

Varje agent är en klass som ärver från BaseAgent och har en tillhörande SKILL.md-fil i knowledge/agents/.

### BaseAgent-kontrakt

```typescript
abstract class BaseAgent {
  abstract name: string;
  abstract defaultModel: 'sonnet' | 'haiku' | 'perplexity' | 'ideogram';
  abstract skillPath: string;

  abstract execute(task: AgentTask): Promise<AgentResult>;
  getSystemPrompt(): string;
  log(entry: LogEntry): void;
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

- Alla API-nycklar i `.env`, aldrig i kod
- Gateway exponeras INTE mot internet. Slack använder Socket Mode (utgående websocket)
- Kill switch: `/fia kill` pausar omedelbart alla agenter som kan publicera
- Principen "minsta möjliga rättighet" per MCP-wrapper
- All data stannar inom EU (Hetzner datacenter)
- Veckovis logg-review av Orchestrator
- Månadsvis varumärkesaudit (manuell stickprovskontroll)

## Varumärkeskontext

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
ANTHROPIC_API_KEY=
IDEOGRAM_API_KEY=
PERPLEXITY_API_KEY=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=
WORDPRESS_URL=
WORDPRESS_API_KEY=
HUBSPOT_API_KEY=
LINKEDIN_ACCESS_TOKEN=
GA4_CREDENTIALS_PATH=
BUFFER_ACCESS_TOKEN=
NODE_ENV=production
LOG_LEVEL=info
LOG_DIR=./logs
KNOWLEDGE_DIR=./knowledge
```

## Byggordning (fas 1 MVP)

### Steg 1: Grundskelett ✅

1. Initiera Node.js/TypeScript-projekt med package.json och tsconfig.json
2. Skapa src/index.ts som startar gatewayen
3. Skapa src/utils/config.ts – läser och validerar .env
4. Skapa src/gateway/logger.ts – strukturerad JSON-loggning till fil
5. Verifiera: Gateway startar, loggar "FIA Gateway started" till fil och stdout

### Steg 2: Slack-integration

1. Skapa src/slack/app.ts – Bolt SDK med Socket Mode
2. Skapa src/slack/commands.ts – /fia status och /fia kill
3. Skapa src/slack/handlers.ts – lyssna på meddelanden i #fia-orchestrator
4. Verifiera: Boten är online i Slack, svarar på /fia status

### Steg 3: LLM-klienter

1. Skapa src/llm/anthropic.ts – Claude Sonnet + Haiku med prompt caching
2. Skapa src/llm/types.ts – gemensamma typer
3. Skapa src/gateway/router.ts – routinglogik baserat på agent + uppgiftstyp
4. Verifiera: Kan skicka en prompt till Sonnet/Haiku och få svar

### Steg 4: Kontexthantering

1. Skapa knowledge/brand/platform.md
2. Skapa knowledge/brand/tonality.md
3. Skapa src/context/context-manager.ts – läser markdown-filer
4. Skapa src/context/prompt-builder.ts – bygger systemprompt med kontext
5. Verifiera: Systemprompt innehåller varumärkeskontext, prompt caching aktiv

### Steg 5: Agent-ramverk

1. Skapa src/agents/base-agent.ts – abstrakt klass
2. Skapa src/agents/agent-loader.ts – läser SKILL.md
3. Skapa knowledge/agents/content/SKILL.md
4. Skapa src/agents/content/content-agent.ts
5. Verifiera: Content Agent kan generera ett blogginlägg med korrekt tonalitet

### Steg 6: Brand Agent

1. Skapa knowledge/agents/brand/SKILL.md med granskningskriterier
2. Skapa src/agents/brand/brand-agent.ts med godkänn/underkänn-logik
3. Implementera eskaleringskedja (3 avslag → Orchestrator)
4. Verifiera: Brand Agent granskar Content Agent output, eskalerar korrekt

### Steg 7: Schemaläggning

1. Skapa src/gateway/scheduler.ts – node-cron
2. Koppla schemalagda uppgifter till agenter
3. Skapa src/utils/kill-switch.ts
4. Verifiera: Content Agent triggas på schema, kill switch pausar allt

### Steg 8: WordPress MCP-wrapper

1. Skapa src/mcp/wordpress.ts – createDraft, publishPost
2. Koppla Content Agent → Brand Agent → WordPress-publicering
3. Verifiera: End-to-end – schemalagd bloggpost publiceras som utkast i WordPress

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

- [x] Fas 1: Gateway-skelett och grundinfrastruktur
- [ ] Fas 1: Slack-integration
- [ ] Fas 1: LLM-klienter och modell-router
- [ ] Fas 1: Kontexthantering och varumärkeskontext
- [ ] Fas 1: Content Agent + Brand Agent
- [ ] Fas 1: WordPress MCP-wrapper
- [ ] Fas 1: Schemaläggning och kill switch
- [ ] Fas 1: 10 innehållsenheter producerade och granskade
- [ ] Fas 2: Strategy, Campaign, SEO, Lead, Analytics agenter
- [ ] Fas 2: LinkedIn, GA4, HubSpot MCP-wrappers
- [ ] Fas 2: Första agentdrivna kampanjen
