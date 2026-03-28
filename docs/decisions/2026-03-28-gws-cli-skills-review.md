# GWS CLI Agent Skills vs FIA — Analys & Rekommendation

**Datum:** 2026-03-28
**FIA-version:** 0.6.0
**Källa:** https://github.com/googleworkspace/cli#ai-agent-skills

---

## Bakgrund

FIA v0.6.0 har tvålagers Google Workspace-integration:

| Lager | Paket | Roll |
|-------|-------|------|
| **Primärt** | `@alanse/mcp-server-google-workspace` v1.0.2 | Direkt Node.js function-anrop via MCP |
| **Fallback** | `@googleworkspace/cli` (gws CLI) | CLI-exec via child_process |

Implementerat i `src/mcp/gws.ts` (295 rader). MCP-paketet exponerar 32+ granulära verktyg, curerat till de ~32 som FIA:s agenter faktiskt behöver.

GWS CLI:n (`@googleworkspace/cli`) — samma paket som redan är FIA:s fallback — har fått **24 färdiga "AI Agent Skills"**: högnivå-kommandon designade att pluggas in i AI-agenter. Denna analys utvärderar om dessa skills tillför värde utöver det FIA redan har.

---

## Tjänst-för-tjänst jämförelse

| Tjänst | GWS CLI Skills | FIA MCP-verktyg | Bedömning |
|--------|---------------|-----------------|-----------|
| **Drive** | 1 skill (`+upload`) | 8 verktyg: `drive_list_files`, `drive_search`, `drive_read_file`, `drive_get_metadata`, `drive_create_file`, `drive_upload_file`, `drive_create_folder`, `drive_list_folder_contents` | **FIA överlägsen** |
| **Docs** | 1 skill (`+write` = append only) | 9 verktyg: `gdocs_create`, `gdocs_read`, `gdocs_get_metadata`, `gdocs_list_documents`, `gdocs_insert_text`, `gdocs_update_text`, `gdocs_append_text`, `gdocs_replace_text`, `gdocs_export` | **FIA överlägsen** |
| **Sheets** | 2 skills (`+read`, `+append`) | 6 verktyg: `gsheets_read`, `gsheets_list_sheets`, `gsheets_create_spreadsheet`, `gsheets_update_cell`, `gsheets_append_data`, `gsheets_batch_update` | **FIA överlägsen** |
| **Calendar** | 2 skills (`+insert`, `+agenda`) | 5 verktyg: `calendar_list_events`, `calendar_get_event`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event` | **FIA överlägsen** |
| **Gmail** | 6 skills: `+send`, `+reply`, `+reply-all`, `+forward`, `+triage`, `+watch` | 4 verktyg: `gmail_search_messages`, `gmail_get_message`, `gmail_send_message`, `gmail_draft_message` | **Blandat** — FIA saknar trådning och streaming |
| **Chat** | 1 skill (`+send`) | — | **Irrelevant** — FIA använder Slack |
| **Apps Script** | 1 skill (`+push`) | — | **Irrelevant** |
| **Events** | 2 skills (`+subscribe`, `+renew`) | Cron-polling via trigger-engine | **Intressant** — push > polling |
| **Model Armor** | 3 skills (sanitize-prompt, sanitize-response, create-template) | Brand Agent (domänspecifik gatekeeper) | **FIA överlägsen** — domänkunskap > generisk filtrering |
| **Workflows** | 5 skills (standup-report, meeting-prep, email-to-task, weekly-digest, file-announce) | Analytics + Strategy-agenter | **FIA överlägsen** — agenterna gör detta med domänkontext |

---

## Alla 24 GWS CLI Skills — individuell bedömning

### Skippa (19 skills) — FIA har redan bättre eller irrelevant

| Skill | Tjänst | Varför skippa |
|-------|--------|---------------|
| `+upload` | Drive | FIA har 8 Drive-verktyg inkl. upload |
| `+write` | Docs | FIA har 9 Docs-verktyg, append är bara ett av dem |
| `+read` | Sheets | FIA har `gsheets_read` + 5 andra verktyg |
| `+append` | Sheets | FIA har `gsheets_append_data` + batch_update |
| `+insert` | Calendar | FIA har `calendar_create_event` + update/delete |
| `+agenda` | Calendar | FIA har `calendar_list_events` med filter |
| `+send` (Gmail) | Gmail | FIA har `gmail_send_message` |
| `+forward` | Gmail | Kan byggas med `gmail_send_message` + headers |
| `+triage` | Gmail | `gmail_search_messages` + Claude = bättre kontextuell triage |
| `+send` (Chat) | Chat | FIA använder Slack, inte Google Chat |
| `+push` | Apps Script | Irrelevant för FIA |
| `+standup-report` | Workflow | Analytics-agenten gör detta med FIA-domändata |
| `+meeting-prep` | Workflow | Inte FIA:s domän (marketing automation, inte kontorsassistent) |
| `+email-to-task` | Workflow | FIA använder Supabase tasks, inte Google Tasks |
| `+weekly-digest` | Workflow | Analytics-agenten producerar veckorapport fredagar 14:00 |
| `+file-announce` | Workflow | FIA meddelar via Slack, inte Google Chat |
| `+sanitize-prompt` | Model Armor | Brand Agent har domänspecifik gatekeeper-logik |
| `+sanitize-response` | Model Armor | Brand Agent med vetorätt > generisk filtrering |
| `+create-template` | Model Armor | Irrelevant — Brand Agent styrs av brand-compliance skill |

### Studera och inspireras av (3 skills) — Fas 2

| Skill | Tjänst | Vad vi kan lära oss | FIA-agent som drar nytta | Prioritet |
|-------|--------|---------------------|--------------------------|-----------|
| **`+reply`** | Gmail | Automatisk trådnings-logik: `In-Reply-To`, `References`, `threadId`-hantering | Lead Agent (nurture-sekvenser) | **Fas 2** |
| **`+reply-all`** | Gmail | Samma trådningslogik + recipient-expansion | Lead Agent | **Fas 2** |
| **`+watch`** | Gmail | NDJSON-streaming av nya mail via Gmail Push Notifications (Pub/Sub) | Intelligence Agent, Lead Agent | **Fas 2/3** |

### Undersök djupare (2 skills) — potentiellt Fas 3

| Skill | Tjänst | Potential | Risk/Komplexitet | Prioritet |
|-------|--------|-----------|-------------------|-----------|
| **`+subscribe`** | Events | Push-baserade Workspace Events istället för cron-polling. Kan trigga agenter i realtid vid doc-ändringar, kalenderupdates etc. | Kräver GCP Pub/Sub-setup, webhook-endpoint, subscription management | **Fas 3** |
| **`+renew`** | Events | Renewal av subscriptions (max 7 dagars TTL) | Kräver `+subscribe` först | **Fas 3** |

---

## Rekommendation

| Beslut | Andel | Antal skills |
|--------|-------|-------------|
| Skippa — FIA har redan bättre eller irrelevant | **~80%** | 19 av 24 |
| Studera implementationen, bygg nativt i MCP-wrappern | **~12%** | 3 av 24 |
| Undersök djupare för framtida fas | **~8%** | 2 av 24 |
| Använd CLI-skills rakt av | **0%** | 0 av 24 |

### Varför inte adoptera rakt av

1. **FIA har redan djupare integration** — 32+ granulära MCP-verktyg vs 24 högnivå-skills
2. **Skills är generiska** — designade för enskild användare, inte multi-agent orchestration med 8 specialiserade agenter
3. **Arkitektur-mismatch** — FIA är MCP-first (in-process), CLI-skills spawnar externa processer
4. **Domänkunskap saknas** — Workflow-skills vet inget om marknadsföring, varumärke eller Forefronts processer
5. **Brand Agent > Model Armor** — domänspecifik gatekeeper med vetorätt och brand-compliance scoring

---

## Åtgärdspunkter för roadmap

### Fas 2 — Gmail trådning för Lead Agent

- Studera gws CLI:s `+reply` implementation för `threadId` / `In-Reply-To` / `References`
- Implementera `gmail_reply_message` i FIA:s MCP-wrapper (`src/mcp/gws.ts`)
- Exponera som curerat verktyg för Lead Agent (nurture-sekvenser)
- Förutsättning: `gmail_get_message` finns redan, behöver threading-metadata

### Fas 2/3 — Gmail Push Notifications

- Studera gws CLI:s `+watch` implementation (Gmail Pub/Sub)
- Utvärdera realtid vs nuvarande cron-polling (30-minuters intervall)
- Kräver: GCP Pub/Sub topic, webhook-endpoint (Express-route)
- Alternativ: Behåll cron om latens inte är kritisk

### Fas 3 — Workspace Events (valfritt)

- Studera gws CLI:s `+subscribe` / `+renew` för push-baserade events
- Potentiellt värde: trigga agenter vid doc-ändringar, kalenderupdates
- Kräver: GCP Pub/Sub-setup, subscription management, 7-dagars renewal
- Beslut: Utvärdera om cron räcker eller om push-latens behövs

---

## Verifiering

- [x] Granskat alla 24 GWS CLI Agent Skills mot FIA:s 32+ MCP-verktyg
- [x] Jämfört tjänst-för-tjänst med FIA:s curerade verktyg i `CURATED_TOOLS` (`src/mcp/gws.ts:89-128`)
- [x] Bekräftat att `@googleworkspace/cli` redan är FIA:s CLI-fallback (`src/mcp/gws.ts:221-242`)
- [x] Utvärderat workflow-skills mot alla 8 agenters ansvarsområden
- [x] Identifierat 5 skills värda att studera/undersöka för Fas 2/3
