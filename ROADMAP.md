# FIA – Roadmap & Changelog

## Klart (Deploy 0.2, 2026-03-15)

- [x] Gateway-skelett, Slack-integration, Supabase-uppsättning
- [x] LLM-klienter, modell-router, kontexthantering
- [x] Content Agent + Brand Agent med Supabase task-skrivning
- [x] REST API, schemaläggning, kill switch
- [x] Claude API-integration (migrerat från Gemini)
- [x] Alla 7 agenter implementerade (Strategy, Content, Campaign, SEO, Lead, Analytics, Brand)
- [x] Testsvit (13 testfiler: router, brand-agent, agent-loader, content-agent, logger, config, skill-loader, task-queue, parallel-screening, self-eval, retry, integration)
- [x] FIA Dashboard MVP (Lovable): auth, agentpuls, godkännandekö, kill switch, Realtime
- [x] Self-eval scoring, parallel pre-screening, exponential backoff retry

## Klart (Deploy 0.5, 2026-03-22)

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

## Klart (Deploy 0.5.1, 2026-03-23)

- [x] Utökad statusmodell: 17 statusar med statusmaskin och övergångsvalidering
- [x] Deklarativ trigger engine: 7 triggers i 4 agenter (Intelligence, Strategy, Analytics, SEO)
- [x] pending_triggers-tabell med godkännandekö i Dashboard
- [x] Task-relationer: parent_task_id, children, lineage
- [x] Dashboard: TaskStatusBadge, TriggersPage, task-relationer i TaskDetailSheet

## Klart (Deploy 0.5.2, 2026-03-23)

- [x] Trigger-konfiguration i dashboard: visa, enable/disable, redigera triggers per agent
- [x] Trigger engine läser från config_json (Supabase) istället för agent.yaml
- [x] config_json.triggers seedas vid gateway-startup, dashboarden äger efter det
- [x] TriggersConfigPage: systemövergripande trigger-översikt med filter
- [x] Reseed från YAML: dry-run diff + bekräftelsedialog (admin only)
- [x] 4 nya API-endpoints, 11 nya React-komponenter, 40+ i18n-nycklar

## Klart (Deploy 0.5.5, 2026-03-24)

- [x] Knowledge Library: kunskapsseeder (skills, system_context, task_context, few_shot, memory)
- [x] Brand context seedas som delad system_context (`knowledge/brand/*.md`)
- [x] Few-shot-filer kategoriseras korrekt som `few_shot` (inte `task_context`)
- [x] `reseed_knowledge`-command i command-listener (Dashboard → Gateway)
- [x] "Populera från server"-knapp i Knowledge Library (admin only)
- [x] Fix: upsert-konflikt – funktionellt unikt index → vanligt unikt index på `agent_knowledge`
- [x] Fix: `emitCommand` returnerar fel så reseed-knappen visar felmeddelanden

## Klart (Deploy 0.5.6, 2026-03-25)

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

## Klart (Deploy 0.5.6 – klientuppdatering, 2026-03-26)

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

## Pågår

- [ ] Gemini context caching
- [ ] GA4 Analytics API
- [ ] 10 innehållsenheter producerade

## Fas 2

- [ ] MCP-wrappers: HubSpot, LinkedIn, Buffer (`src/mcp/` – ej påbörjat)
- [ ] Content staging med Zod-validering av content_json

## Fas 3

- [ ] Feedback-loop: rating-UI, feedback-summary, dynamisk sample_review_rate
- [ ] Few-shot "avoid"-exempel från lågt betygsatt content
