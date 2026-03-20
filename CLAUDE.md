# FIA – Forefront Intelligent Automation

AI-agentgateway som ersätter Forefronts marknadsavdelning. Sju agentkluster utför operativt marknadsarbete. 1–2 Marketing Orchestrators styr – sätter riktning och godkänner.

**Princip:** Human on the loop – agenter beslutar och exekverar inom definierade ramar.

**Dual-interface:** Slack (kommandon) + FIA Dashboard PWA (grafisk vy, godkännandekö, KPI, kill switch).

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
│   └── utils/                   # Config, errors, kill-switch
├── knowledge/                   # Kunskapsbas (se knowledge/CLAUDE.md)
│   ├── brand/                   # Delad varumärkeskontext
│   └── agents/                  # Per-agent: agent.yaml, SKILL.md, context/, memory/
├── supabase/                    # Migreringar och seed (se supabase/CLAUDE.md)
├── tests/                       # Testsvit (se tests/CLAUDE.md)
├── scripts/                     # Hjälpskript
└── logs/                        # JSON-loggar (gitignored)
```

## Kommandon

```bash
npm run dev          # ts-node med watch
npm run build        # TypeScript → JavaScript
npm run start        # Kör byggd version
npm test             # Alla tester (Jest)
npm run test:router  # Enbart routing-tester
npm run test:brand   # Enbart Brand Agent-tester

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

### Pågår

- [x] gws MCP kopplad till agenter (via @alanse/mcp-server-google-workspace + CLI fallback)
- [ ] Gemini context caching
- [ ] GA4 Analytics API
- [ ] 10 innehållsenheter producerade

### Fas 2

- [ ] MCP-wrappers: HubSpot, LinkedIn, Buffer (`src/mcp/` – ej påbörjat)
- [ ] Content staging med Zod-validering av content_json
- [x] CI/CD (GitHub Actions) — `.github/workflows/ci.yml`
- [x] ESLint + Prettier — `eslint.config.mjs`, `.prettierrc`
- [x] Teknisk skuld B1–B12: alla 12 backend-fixar åtgärdade (2026-03-19)
