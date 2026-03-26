# MCP-integrationer

FIA Gateway anvander Model Context Protocol (MCP) for att ge agenter tillgang till externa verktyg. Varje agent deklarerar sina verktyg i `agent.yaml` under `tools`-faltet. Tool Registry (`src/mcp/tool-registry.ts`) bygger verktygsdefinitioner och routar anrop till ratt wrapper.

---

## Oversikt

| Integration            | Status             | Wrapper                             | Anvands av                                      |
| ---------------------- | ------------------ | ----------------------------------- | ----------------------------------------------- |
| Google Workspace (gws) | Live               | `src/mcp/gws.ts`                    | Content, Strategy, Analytics, SEO, Intelligence |
| HubSpot                | Fas 2              | `src/mcp/hubspot.ts` (placeholder)  | Campaign, Lead, Analytics, Strategy             |
| LinkedIn               | Fas 2              | `src/mcp/linkedin.ts` (placeholder) | Campaign                                        |
| Buffer                 | Fas 2              | `src/mcp/buffer.ts` (placeholder)   | Content, Campaign                               |
| GA4 Analytics          | Fas 2 (direkt API) | --                                  | Analytics                                       |

---

## Google Workspace (gws)

### Arkitektur

GWS-integrationen har tva lager:

1. **Primar:** Importerar verktyg fran `@alanse/mcp-server-google-workspace` (NPM-paket).
2. **Fallback:** Exekverar `gws` CLI (`@googleworkspace/cli`) via `child_process` om MCP-paketet inte har verktyget.

### Tillgangliga tjanster

| Tjanst i agent.yaml | Verktygprefix | Antal verktyg | Exempel                                                       |
| ------------------- | ------------- | ------------- | ------------------------------------------------------------- |
| `gws:drive`         | `drive_`      | 8             | `drive_list_files`, `drive_search`, `drive_create_file`       |
| `gws:docs`          | `gdocs_`      | 9             | `gdocs_create`, `gdocs_read`, `gdocs_export`                  |
| `gws:sheets`        | `gsheets_`    | 6             | `gsheets_read`, `gsheets_append_data`, `gsheets_batch_update` |
| `gws:gmail`         | `gmail_`      | 4             | `gmail_search_messages`, `gmail_send_message`                 |
| `gws:calendar`      | `calendar_`   | 5             | `calendar_list_events`, `calendar_create_event`               |
| `gws:analytics`     | --            | 0             | Inte i MCP-paketet annu. GA4 via direkt API i Fas 2.          |

!!! info "Kurerade verktyg"
Gateway exponerar inte alla 130+ verktyg fran MCP-paketet. Istallet valjs en kurerad delmangd per tjanst for att halla verktygslistan liten och token-effektiv for LLM-anrop.

### Setup

#### 1. Installera MCP-paket

Paketet installeras automatiskt via `npm install`:

```bash
npm install @alanse/mcp-server-google-workspace
```

#### 2. OAuth-credentials

MCP-paketet kraver tre env-variabler i `.env`:

```bash
GWORKSPACE_CREDS_DIR=/home/marcus_landstrom/FIA
CLIENT_ID=ditt-id.apps.googleusercontent.com
CLIENT_SECRET=GOCSPX-din-secret
```

Dessutom maste `gcp-oauth.keys.json` finnas i `GWORKSPACE_CREDS_DIR`:

```json
{
  "installed": {
    "client_id": "ditt-id.apps.googleusercontent.com",
    "client_secret": "GOCSPX-din-secret"
  }
}
```

!!! danger "Absoluta sokvagar"
Anvand alltid absoluta sokvagar. Tilde (`~`) expanderas **inte** korrekt i gws CLI v0.4.4.

!!! warning "Produktion: byt till fia@forefront.se"
GWS ar for narvarande autentiserat med marcus.landstrom@forefront.se (utvecklarkonto). For produktion ska ett dedikerat tjanstekonto `fia@forefront.se` anvandas sa att agenter inte opererar pa en personlig Drive/Gmail. Skapa kontot i Google Workspace Admin, kor auth-scriptet som det kontot, och uppdatera credentials.

### OAuth-autentisering (headless VPS)

Auth-scriptet `scripts/gws-auth.mjs` gor headless OAuth utan extra dependencies. Det genererar en URL som oppnas i webbläsare pa valfri dator.

#### Forutsattningar

1. OAuth Client ID av typen **Desktop App** i Google Cloud Console (projekt `ffcg-fia`)
2. OAuth consent screen satt till **Internal** (Google Workspace) — ger obegransad token-livstid
3. `gcp-oauth.keys.json` med `"installed"`-nyckel i `GWORKSPACE_CREDS_DIR`
4. `CLIENT_ID` och `CLIENT_SECRET` i `.env`

!!! warning "Desktop App, inte Web Application"
OAuth-klienten **maste** vara av typen "Desktop App" i Google Cloud Console. "Web Application"-klienter stodjer inte `http://localhost` redirect URI som auth-scriptet anvander. Ladda ner JSON fran Console — den ska ha en `"installed"`-nyckel.

!!! tip "Internal app = permanent auth"
Med OAuth consent screen satt till **Internal** (kraver Google Workspace) loper refresh tokens aldrig ut. Gateway refreshar access tokens automatiskt var 45:e minut via `setupTokenRefresh()`. Du ska aldrig behova kora auth-scriptet igen efter initial setup.

#### Steg

```bash
cd ~/FIA

# Kor auth-scriptet (laser CLIENT_ID/CLIENT_SECRET fran .env)
source .env
node scripts/gws-auth.mjs
```

1. Scriptet visar en OAuth-URL
2. Oppna URL:en i webbläsare pa din dator (logga in som ratt Google-konto)
3. Godkann alla behorigheter
4. Sidan redirectar till `http://localhost/?code=XXXX&scope=...` (visar fel -- det ar forväntat)
5. Kopiera allt mellan `code=` och `&scope` i URL:en
6. Klistra in i terminalen och tryck Enter
7. Tokens sparas till `$GWORKSPACE_CREDS_DIR/.gworkspace-credentials.json`

#### Token-refresh

Gateway hanterar token-refresh automatiskt:

- `ensureGlobalAuth()` i `src/mcp/gws.ts` laddar credentials och satter `google.options({ auth })`
- `setupTokenRefresh()` refreshar var 45:e minut
- `expiry_date` (timestamp) anvands for att avgora nar refresh behovs
- Med **Internal** OAuth consent screen loper refresh_token aldrig ut

!!! note "Om auth slutar fungera"
Om token av nagon anledning upphör (t.ex. OAuth-klient raderas eller aterställs):
`source ~/FIA/.env && node ~/FIA/scripts/gws-auth.mjs`

---

## Kanda buggar i gws CLI v0.4.4

!!! bug "SA-nycklar ignoreras tyst"
Service Account (SA) JSON-nycklar satt via `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` ignoreras tyst av gws CLI v0.4.4. Inga felmeddelanden visas -- anropen misslyckas bara. **Losning:** Anvand OAuth via `scripts/gws-auth.mjs`.

!!! bug "Tilde expanderas inte"
Sokvagar med `~` (t.ex. `~/credentials.json`) expanderas inte. Anvand alltid absoluta sokvagar.

!!! bug "gws analytics ar inte ett giltigt kommando"
`gws analytics` finns inte i CLI:n. Google Analytics 4-data maste hamtas via direkt API-integration (planerad for Fas 2).

!!! bug "gws auth login hanger pa headless VPS"
`gws auth login` visar en URL men accepterar inte input (stdin-bugg). Anvand `scripts/gws-auth.mjs` istallet -- det gor samma OAuth-flow men med fungerande stdin.

!!! bug "Plaintext credentials ignoreras av CLI"
gws CLI v0.4.4 kraver krypterade credentials (`credentials.enc`). Plaintext JSON-filer ignoreras aven om `gws auth status` visar `plain_credentials_exists: true`. **Losning:** Anvand `GOOGLE_WORKSPACE_CLI_TOKEN` env var for direkt CLI-anvandning, eller lat MCP-wrappern hantera auth.

---

## Tool Registry

`src/mcp/tool-registry.ts` ar den centrala dispatchern for agentverktyg:

1. **`buildToolDefinitions(agentTools)`** -- Bygger `ToolDefinition[]` for LLM tool_use baserat pa agentens `tools`-falt.
2. **`dispatchToolUse(toolUse, config)`** -- Routar tool_use-anrop till ratt wrapper (GWS, HubSpot, etc.).
3. **`hasTools(agentTools)`** -- Kontrollerar om en agent har nagra konfigurerade verktyg.

```
Agent manifest (tools: ["gws:drive", "gws:docs"])
  → buildToolDefinitions() → ToolDefinition[] for LLM
  → LLM returnerar tool_use → dispatchToolUse() → gws.ts handler
  → Resultat tillbaka till LLM
```

---

## Per-agent verktygstilldelning

Verktyg deklareras i varje agents `agent.yaml` under `tools`:

| Agent        | Verktyg                                                               |
| ------------ | --------------------------------------------------------------------- |
| Content      | `buffer`, `gws:drive`, `gws:docs`                                     |
| Strategy     | `gws:drive`, `gws:analytics`, `gws:calendar`, `gws:sheets`, `hubspot` |
| Campaign     | `hubspot`, `linkedin`, `buffer`                                       |
| SEO          | `gws:drive`, `gws:analytics`, `gws:sheets`                            |
| Lead         | `hubspot`                                                             |
| Analytics    | `gws:analytics`, `gws:sheets`, `gws:drive`, `hubspot`                 |
| Intelligence | `gws:drive`, `gws:docs`, `gws:sheets`                                 |
| Brand        | _(inga verktyg)_                                                      |

!!! note "Minsta mojliga rattighet"
Varje agent far enbart tillgang till de verktyg den behover. Brand Agent har t.ex. inga verktyg alls -- den granskar enbart innehall.

---

## Google Drive-organisation

FIA anvander en strukturerad mappstruktur pa Google Drive for att organisera agenternas filer. Strukturen skapas via CLI-kommandot `fia drive setup`.

### Mappstruktur

```
FIA/
├── Content/
│   ├── Blogg/
│   ├── Sociala medier/
│   └── Utkast/
├── Kampanjer/
├── Strategi/
├── SEO/
├── Analytics/
│   ├── Veckorapporter/
│   └── Månadsrapporter/
├── Intelligence/
└── Mallar/
```

### Agent → mapp-mapping

| Agent        | Mappar                                                                        |
| ------------ | ----------------------------------------------------------------------------- |
| Content      | FIA/Content/Blogg, FIA/Content/Sociala medier, FIA/Content/Utkast, FIA/Mallar |
| Intelligence | FIA/Intelligence, FIA/Content/Utkast                                          |
| Analytics    | FIA/Analytics/Veckorapporter, FIA/Analytics/Manadsrapporter                   |
| Strategy     | FIA/Strategi, FIA/Kampanjer                                                   |
| SEO          | FIA/SEO                                                                       |

### Setup

```bash
# Forhandsvisa utan att skapa
fia drive setup --dry-run

# Skapa mappstrukturen
fia drive setup

# Visa aktuell status
fia drive status
```

Setup-servicen ar **idempotent** — den hoppar over mappar som redan finns och skapar enbart saknade. Folder-IDs sparas i Supabase `system_settings` (key: `drive_folder_map`) och genererar `context/drive-folders.md` per agent sa att LLM:en vet var filer ska sparas.

### Implementation

| Fil                          | Beskrivning                             |
| ---------------------------- | --------------------------------------- |
| `src/mcp/drive-structure.ts` | Deklarativ mapptrad + agent-mapping     |
| `src/mcp/drive-setup.ts`     | Setup-service: skapa, verifiera, spara  |
| `src/api/routes/drive.ts`    | API-endpoints: GET /status, POST /setup |
| `cli/commands/drive.ts`      | CLI-kommando: `fia drive setup/status`  |
