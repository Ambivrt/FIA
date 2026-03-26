# FIA – Forefront Intelligent Automation

AI-agentgateway som ersätter Forefronts marknadsavdelning. Åtta agentkluster utför operativt marknadsarbete. 1–2 Marketing Orchestrators styr – sätter riktning och godkänner.

**Princip:** Human on the loop – agenter beslutar och exekverar inom definierade ramar.

**Triple-interface:** Slack (kommandon) + FIA Dashboard PWA (grafisk vy, godkännandekö, KPI, kill switch) + FIA CLI (terminalverktyg för SSH/lokal access).

**Dashboard-repo:** `ambivrt/fia-frontend`

## Teknikstack

| Komponent         | Teknologi                                    |
| ----------------- | -------------------------------------------- |
| Runtime           | Node.js daemon via PM2                       |
| Språk             | TypeScript (strict mode)                     |
| LLM-primär        | Anthropic Claude API (Opus 4.6 + Sonnet 4.6) |
| LLM-bild          | Nano Banana 2 (Gemini Flash Image)           |
| Sökning           | Serper API (Google Search)                   |
| Slack             | Bolt SDK, Socket Mode                        |
| Schemaläggning    | node-cron                                    |
| Databas           | Supabase PostgreSQL (EU-region)              |
| Google Workspace  | gws CLI som MCP-server                       |
| MCP-integrationer | HubSpot, LinkedIn, Buffer (fas 2)            |
| REST API          | Express (internt, ej exponerat)              |
| CLI               | Commander, chalk, boxen, ora, cli-table3     |
| Deploy            | GCP Compute Engine (europe-north1), PM2      |

## Kodkonventioner

- TypeScript strict mode, async/await överallt
- Explicita typer på alla publika funktioner
- Alla LLM-anrop i try/catch med strukturerad loggning
- Inga externa agent-ramverk – tunt och kontrollerat
- Modell-routing definieras i `agent.yaml` per agent – aldrig hårdkodad i kod
- MCP-wrappers: tunna (50–200 rader), minsta möjliga rättighet
- **Kör alltid `npm run format:check` innan commit** — fixa med `npm run format`
- Logga via gateway logger, inte console.log
- Svenska i all user-facing text och dokumentation
- Inga WordPress-integrationer

## Projektstruktur

```
fia/
├── CLAUDE.md              # Denna fil – projektöversikt
├── ROADMAP.md             # Changelog och roadmap
├── src/                   # Gateway-källkod (se src/CLAUDE.md)
├── cli/                   # FIA CLI-klient (Commander, 16 kommandon)
├── knowledge/             # Kunskapsbas (se knowledge/CLAUDE.md)
├── supabase/              # Migreringar och seed (se supabase/CLAUDE.md)
├── tests/                 # Testsvit (se tests/CLAUDE.md)
├── scripts/               # Hjälpskript
└── logs/                  # JSON-loggar (gitignored)
```

## Kommandon

```bash
npm run dev          # ts-node med watch
npm run build        # TypeScript → JavaScript (gateway + CLI)
npm run build:cli    # Enbart CLI
npm run start        # Kör byggd version
npm test             # Alla tester (Jest)
npm run test:router  # Enbart routing-tester
npm run test:brand   # Enbart Brand Agent-tester
npm run test:cli     # Enbart CLI-tester

# CLI (kräver FIA_CLI_TOKEN i .env)
npx fia status       # Systemöversikt
npx fia agents       # Agenttabell
npx fia run content blog_post --priority high
npx fia queue        # Köade/pågående tasks
npx fia approve <id> # Godkänn task
npx fia reject <id> --feedback "..."
npx fia kill         # Aktivera kill switch
npx fia resume       # Avaktivera kill switch
npx fia logs         # Aktivitetslogg
npx fia tail         # Live-stream (Supabase Realtime)
npx fia watch        # Mini-dashboard (live)
npx fia config content --routing
npx fia drive status
npx fia drive setup
npx fia costs
npx fia knowledge list|reseed

# PM2 (produktion, på VPS: ~/fia-server)
pm2 start ecosystem.config.js
pm2 logs fia-gateway
pm2 restart fia-gateway
```

## LLM-routing (manifest-driven)

Varje agents `agent.yaml` har ett `routing`-fält som mappar uppgiftstyp → modell. Routern läser detta – ingen hårdkodning. Stöder fallback-objekt (`{ primary, fallback }`).

| Modell            | Användning                                         | Pris (1M tokens)    |
| ----------------- | -------------------------------------------------- | ------------------- |
| Claude Opus 4.6   | Innehåll, strategi, analys, Brand Agent-granskning | $15 in / $75 ut     |
| Claude Sonnet 4.6 | Metadata, scoring, klassificering, A/B-varianter   | $3 in / $15 ut      |
| Gemini 2.5 Pro    | Fallback för text, djupanalys                      | $1.25 in / $10 ut   |
| Gemini 2.5 Flash  | Fallback för text, snabba uppgifter                | $0.15 in / $0.60 ut |
| Nano Banana 2     | Bildgenerering                                     | ~$0.04/bild         |
| Serper API        | Realtidssökning, trendspaning                      | $0.001/sökning      |

> **Agent details:** Se `knowledge/CLAUDE.md`
> **API endpoints & schemaläggning:** Se `src/CLAUDE.md`
> **Datamodell:** Se `supabase/CLAUDE.md`
> **Tester:** Se `tests/CLAUDE.md`

## Varumärke (Forefront)

- **Löfte:** Delade visioner. Större ambitioner.
- **Karaktär:** Modiga, Hängivna, Lustfyllda
- **Ton:** Klok kollega – konkret, nyfiken, humor tillåtet, aktiv röst
- **Färger:** #7D5365, #42504E, #555977, #756256, #7E7C83
- **Gradient:** #FF6B0B → #FFB7F8 → #79F2FB
- **Typsnitt:** Manrope (fallback Arial)

## Miljövariabler

Se `.env.example` för alla nyckelnamn. Aldrig i kod. Kritiska:

- `ANTHROPIC_API_KEY` – Claude API
- `GEMINI_API_KEY` – Gemini/Nano Banana 2
- `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` – Slack
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – Supabase
- `SERPER_API_KEY` – Google Search
- `FIA_CLI_TOKEN` – Lokal auth-token för CLI (bypass JWT)

## Watch out

- gws CLI v0.4.4 har bugg med SA credentials → använd OAuth
- Kill switch lever i Supabase system_settings
- Drive folder map lever i Supabase system_settings (key: drive_folder_map)
- Kör `fia drive setup` för att skapa/verifiera Drive-mappar
- OAuth consent screen är Internal (Google Workspace) — refresh tokens löper aldrig ut
- OAuth-klient måste vara Desktop App (inte Web Application) — `gcp-oauth.keys.json` har `"installed"`-nyckel
- Gateway refreshar access tokens automatiskt var 45:e minut via `setupTokenRefresh()`
- Triggers seedas från agent.yaml vid startup men dashboarden äger config efter seed
- ANTHROPIC_API_KEY finns i .env – används av gateway, inte direkt av agents
- Tasks flödar: queued → in_progress → completed → awaiting_review → approved → delivered
- Brand Agent har vetorätt – allt content passerar den
- Status machine i `src/engine/status-machine.ts` – alla övergångar valideras
