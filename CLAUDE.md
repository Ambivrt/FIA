# FIA – Forefront Intelligent Automation

AI-agentgateway som ersätter Forefronts marknadsavdelning. Sju agentkluster utför operativt marknadsarbete. 1–2 Marketing Orchestrators styr – sätter riktning och godkänner.

**Princip:** Human on the loop – agenter beslutar och exekverar inom definierade ramar.

**Triple-interface:** Slack (kommandon) + FIA Dashboard PWA (grafisk vy, godkännandekö, KPI, kill switch) + FIA CLI (terminalverktyg för SSH/lokal access).

## Teknikstack

| Komponent         | Teknologi                                    |
| ----------------- | -------------------------------------------- |
| Runtime           | Node.js daemon via PM2                       |
| Språk             | TypeScript (strict mode)                     |
| LLM-primär        | Anthropic Claude API (Opus 4.6 + Sonnet 4.6) |
| LLM-bild          | Nano Banana 2 (Gemini 3.1 Flash Image)       |
| Sökning           | Serper API (Google Search)                   |
| Slack             | Bolt SDK, Socket Mode                        |
| Schemaläggning    | node-cron                                    |
| Databas           | Supabase PostgreSQL (EU-region)              |
| Google Workspace  | gws CLI som MCP-server                       |
| MCP-integrationer | HubSpot, LinkedIn, Buffer                    |
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

## Projektstruktur (översikt)

```
fia/
├── CLAUDE.md                    # Denna fil – projektöversikt
├── src/                         # Gateway-källkod (se src/CLAUDE.md)
│   ├── index.ts                 # Entrypoint
│   ├── gateway/                 # Orkestrering, routing, scheduler, logger
│   ├── agents/                  # Agent-implementationer + base-agent + loader
│   ├── llm/                     # LLM-klienter (Claude, Gemini, Serper)
│   ├── slack/                   # Bolt SDK, kommandon, handlers
│   ├── supabase/                # DB-klient, heartbeat, writers, listeners
│   ├── api/                     # REST API (Express, routes, auth middleware)
│   ├── mcp/                     # MCP-wrappers (GWS, HubSpot, LinkedIn, Buffer)
│   ├── context/                 # Kontexthantering, prompt-builder
│   ├── shared/                  # Delad kod (display-status)
│   └── utils/                   # Config, errors, kill-switch
├── cli/                         # FIA CLI-klient
│   ├── index.ts                 # Entry point, Commander setup
│   ├── commands/                # Ett kommando per fil (16 st)
│   ├── lib/                     # api-client, formatters, realtime, config
│   └── types.ts                 # CLI-specifika typer
├── knowledge/                   # Kunskapsbas (se knowledge/CLAUDE.md)
│   ├── brand/                   # Delad varumärkeskontext
│   └── agents/                  # Per-agent: agent.yaml, SKILL.md, context/, memory/
├── supabase/                    # Migreringar och seed (se supabase/CLAUDE.md)
├── tests/                       # Testsvit (se tests/CLAUDE.md)
│   └── cli/                     # CLI-tester (formatters, api-client, commands)
├── scripts/                     # Hjälpskript
└── logs/                        # JSON-loggar (gitignored)
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
npx fia drive status   # Visa Drive-mappstruktur
npx fia drive setup    # Skapa mappar på Google Drive
npx fia drive setup --dry-run  # Förhandsvisa utan att skapa

# PM2 (produktion, på VPS: ~/fia-server)
pm2 start ecosystem.config.js
pm2 logs fia-gateway
pm2 restart fia-gateway
```

## LLM-routing (manifest-driven)

Varje agents `agent.yaml` har ett `routing`-fält som mappar uppgiftstyp → modell. Routern läser detta – ingen hårdkodning.

| Modell            | Användning                                         | Pris (1M tokens)    |
| ----------------- | -------------------------------------------------- | ------------------- |
| Claude Opus 4.6   | Innehåll, strategi, analys, Brand Agent-granskning | $15 in / $75 ut     |
| Claude Sonnet 4.6 | Metadata, scoring, klassificering, A/B-varianter   | $3 in / $15 ut      |
| Gemini 2.5 Pro    | Fallback för text, djupanalys                      | $1.25 in / $10 ut   |
| Gemini 2.5 Flash  | Fallback för text, snabba uppgifter                | $0.15 in / $0.60 ut |
| Nano Banana 2     | Bildgenerering                                     | ~$0.04/bild         |
| Serper API        | Realtidssökning, trendspaning                      | $0.001/sökning      |

## Agenter

Sju agenter under `knowledge/agents/<slug>/`. Varje har `agent.yaml` (manifest), `SKILL.md` (roll/guardrails), `context/` (mallar, few-shot) och `memory/` (skrivbar).

| Agent     | Slug      | Autonomi        | Nyckelansvar                              |
| --------- | --------- | --------------- | ----------------------------------------- |
| Strategy  | strategy  | semi-autonomous | Planering, kvartals-/månadsplaner         |
| Content   | content   | autonomous      | All textproduktion, blogg, sociala medier |
| Campaign  | campaign  | autonomous      | Kampanjer, email-sekvenser, annonser      |
| SEO       | seo       | autonomous      | Sökoptimering, keyword-analys             |
| Lead      | lead      | autonomous      | Lead scoring, nurture-sekvenser           |
| Analytics | analytics | autonomous      | Rapporter, KPI-tracking, morgonpuls       |
| Brand     | brand     | autonomous      | Kvalitetsgranskning (vetorätt)            |

## Agentflöde

```
Trigger (cron/Slack/agent) → Gateway → agent-loader → router → LLM-anrop
  → Brand Agent granskar (vid publicering)
  → Godkänt → Publicera via MCP
  → Underkänt → Tillbaka med feedback (3x → eskalera till Orchestrator)
```

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

## Pågående arbete

### Klart (Deploy 0.2, 2026-03-15)

- [x] Gateway-skelett, Slack-integration, Supabase-uppsättning
- [x] LLM-klienter, modell-router, kontexthantering
- [x] Content Agent + Brand Agent med Supabase task-skrivning
- [x] REST API, schemaläggning, kill switch
- [x] Claude API-integration (migrerat från Gemini)
- [x] Alla 7 agenter implementerade (Strategy, Content, Campaign, SEO, Lead, Analytics, Brand)
- [x] Testsvit (13 testfiler: router, brand-agent, agent-loader, content-agent, logger, config, skill-loader, task-queue, parallel-screening, self-eval, retry, integration)
- [x] FIA Dashboard MVP (Lovable): auth, agentpuls, godkännandekö, kill switch, Realtime
- [x] Self-eval scoring, parallel pre-screening, exponential backoff retry

### Klart (Deploy 0.5, 2026-03-22)

- [x] FIA Display Status – gemensam standard (`src/shared/display-status.ts`): online/working/paused/killed/error med resolve-logik, färger och symboler för CLI/Dashboard/Slack
- [x] FIA CLI-klient (`cli/`) – 11 kommandon: status, agents, run, queue, approve, reject, kill, resume, logs, tail, watch, config
- [x] CLI auth middleware – FIA_CLI_TOKEN-bypass i gateway (admin-roll, skippar JWT)
- [x] POST /api/tasks – nytt endpoint för task-skapande från CLI/Dashboard
- [x] Kommaseparerade status-filter i GET /api/tasks
- [x] Forefront Earth-palett och gradient i CLI (varumärkesfärger)
- [x] CLI-tester (3 testfiler, 25 tester: formatters, api-client, commands)
- [x] gws MCP kopplad till agenter (via @alanse/mcp-server-google-workspace + CLI fallback)
- [x] CI/CD (GitHub Actions) — `.github/workflows/ci.yml`
- [x] ESLint + Prettier — `eslint.config.mjs`, `.prettierrc`
- [x] Teknisk skuld B1–B12: alla 12 backend-fixar åtgärdade (2026-03-19)

### Klart (Deploy 0.5.1, 2026-03-23)

- [x] Utökad statusmodell: 17 statusar med statusmaskin och övergångsvalidering
- [x] Deklarativ trigger engine: 7 triggers i 4 agenter (Intelligence, Strategy, Analytics, SEO)
- [x] pending_triggers-tabell med godkännandekö i Dashboard
- [x] Task-relationer: parent_task_id, children, lineage
- [x] Dashboard: TaskStatusBadge, TriggersPage, task-relationer i TaskDetailSheet

### Klart (Deploy 0.5.2, 2026-03-23)

- [x] Trigger-konfiguration i dashboard: visa, enable/disable, redigera triggers per agent
- [x] Trigger engine läser från config_json (Supabase) istället för agent.yaml
- [x] config_json.triggers seedas vid gateway-startup, dashboarden äger efter det
- [x] TriggersConfigPage: systemövergripande trigger-översikt med filter
- [x] Reseed från YAML: dry-run diff + bekräftelsedialog (admin only)
- [x] 4 nya API-endpoints, 11 nya React-komponenter, 40+ i18n-nycklar

### Klart (Deploy 0.5.5, 2026-03-24)

- [x] Knowledge Library: kunskapsseeder (skills, system_context, task_context, few_shot, memory)
- [x] Brand context seedas som delad system_context (`knowledge/brand/*.md`)
- [x] Few-shot-filer kategoriseras korrekt som `few_shot` (inte `task_context`)
- [x] `reseed_knowledge`-command i command-listener (Dashboard → Gateway)
- [x] "Populera från server"-knapp i Knowledge Library (admin only)
- [x] Fix: upsert-konflikt – funktionellt unikt index → vanligt unikt index på `agent_knowledge`
- [x] Fix: `emitCommand` returnerar fel så reseed-knappen visar felmeddelanden

### Klart (Deploy 0.5.6, 2026-03-25)

- [x] Google Drive-organisation: CLI-kommando (`fia drive setup/status`) + API-endpoints
- [x] Idempotent Drive setup-service: skapa/verifiera mappar, spara folder-IDs i Supabase
- [x] Auto-genererade `drive-folders.md` kontextfiler per agent med folder-IDs
- [x] `gws:drive` tillagt på Strategy och SEO agenter
- [x] Nya filer: `src/mcp/drive-structure.ts`, `src/mcp/drive-setup.ts`, `src/api/routes/drive.ts`, `cli/commands/drive.ts`
- [x] Fix: googleapis global auth — `ensureGlobalAuth()` sätter `google.options({ auth })` + token refresh
- [x] Fix: MCP `isError` response-detektion i `gws.ts` (felaktiga svar kastade inte errors)
- [x] Fix: MCP Drive-svar-parsning — folder-ID extraheras ur formaterad text, inte bara JSON
- [x] Fix: `gws-auth.mjs` — `expiry_date` (timestamp) istället för bara `expires_in`, full `drive`-scope
- [x] `.gworkspace-credentials.json` och `gcp-oauth.keys.json` tillagda i `.gitignore`
- [x] Debug-script: `scripts/test-drive-auth.mjs` för OAuth-felsökning

### Klart (Deploy 0.5.6 – klientuppdatering, 2026-03-26)

- [x] Rollsystem v2: 5 roller (admin, orchestrator, reviewer, viewer, external), 18 permissions
- [x] DB-migration `017_role_system_v2.sql` – operator→reviewer, external tillagd, RLS-uppdateringar
- [x] Backend permissions-modul (`src/api/permissions.ts`) med `hasPermission()` + `requirePermission()` middleware
- [x] Slack user→role-mapping: `slack_user_id`-kolumn på profiles (migration `018_slack_user_mapping.sql`)
- [x] Slack auth-helper (`src/slack/auth.ts`) med cachad lookup och permission-check
- [x] Slack permission-kontroll på destruktiva kommandon (kill, resume, drive setup)
- [x] Nya Slack-kommandon: `/fia drive status|setup`, `/fia costs`, `/fia whoami`
- [x] GWS Drive-status i `/fia status` (Slack) och `fia status` (CLI)
- [x] Roll-info i `fia status` (CLI)
- [x] Nya CLI-kommandon: `fia costs`, `fia knowledge list|reseed`
- [x] GET /api/knowledge endpoint för knowledge-listning
- [x] Dashboard: Drive-status widget i Inställningar, version 0.5.6 i sidebar
- [x] Frontend rollsystem v2: centraliserad `permissions.ts`, permission-baserad navigation och UI
- [x] Dashboard: PublishedContentPage för external-rollen
- [x] Uppdaterad Slack help-text med grupperade kommandon

### Pågår

- [ ] Gemini context caching
- [ ] GA4 Analytics API
- [ ] 10 innehållsenheter producerade

### Fas 2

- [ ] MCP-wrappers: HubSpot, LinkedIn, Buffer (`src/mcp/` – ej påbörjat)
- [ ] Content staging med Zod-validering av content_json
