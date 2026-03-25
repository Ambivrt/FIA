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

Satt foljande i `.env`:

```bash
GWORKSPACE_CREDS_DIR=/home/marcus_landstrom/FIA
```

!!! danger "Absoluta sokvagar"
Anvand alltid absoluta sokvagar. Tilde (`~`) expanderas **inte** korrekt i gws CLI v0.4.4.

!!! warning "Produktion: byt till fia@forefront.se"
GWS ar for narvarande autentiserat med marcus.landstrom@forefront.se (utvecklarkonto). For produktion ska ett dedikerat tjanstekonto `fia@forefront.se` anvandas sa att agenter inte opererar pa en personlig Drive/Gmail. Skapa kontot i Google Workspace Admin, kor auth-scriptet som det kontot, och uppdatera credentials.

### OAuth-autentisering (headless VPS)

Auth-scriptet `scripts/gws-auth.mjs` gor headless OAuth utan extra dependencies. Det genererar en URL som oppnas i webbläsare pa valfri dator.

#### Forutsattningar

1. OAuth Client ID konfigurerat i Google Cloud Console (projekt `ffcg-fia`)
2. `client_secret.json` placerad i `~/.config/gws/` (skapas via `gws auth setup`)
3. `http://localhost` konfigurerat som Authorized redirect URI

#### Steg

```bash
cd ~/FIA

# Hamta client_id och client_secret fran:
cat ~/.config/gws/client_secret.json

# Kor auth-scriptet
CLIENT_ID="ditt-id.apps.googleusercontent.com" \
CLIENT_SECRET="GOCSPX-din-secret" \
GWORKSPACE_CREDS_DIR=/home/marcus_landstrom/FIA \
node scripts/gws-auth.mjs
```

1. Scriptet visar en OAuth-URL
2. Oppna URL:en i webbläsare pa din dator (logga in som ratt Google-konto)
3. Godkann alla behorigheter
4. Sidan redirectar till `http://localhost/?code=XXXX&scope=...` (visar fel -- det ar forväntat)
5. Kopiera allt mellan `code=` och `&scope` i URL:en
6. Klistra in i terminalen och tryck Enter
7. Tokens sparas till `$GWORKSPACE_CREDS_DIR/.gworkspace-credentials.json`

#### gws CLI med token

gws CLI v0.4.4 laser inte plaintext-credentials automatiskt. For att anvanda gws CLI direkt, exportera token:

```bash
export GOOGLE_WORKSPACE_CLI_TOKEN=$(cat ~/FIA/.gworkspace-credentials.json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).access_token))")
gws drive files list
```

!!! note "Access token giltig i 1 timme"
Access token fran OAuth loper ut efter ~1 timme. Gateway-MCP-wrappern (`src/mcp/gws.ts`) hanterar token-refresh automatiskt via refresh_token. For manuell CLI-anvandning, kor export-kommandot igen.

#### Alternativ: gws auth export (fran maskin med webbläsare)

Om du har tillgang till en maskin med webbläsare (t.ex. lokal dator):

```bash
# Pa maskin med webbläsare
npx @googleworkspace/cli auth login
npx @googleworkspace/cli auth export --unmasked > credentials.json

# Kopiera till VPS
scp credentials.json user@VPS:~/FIA/gws-credentials.json

# Pa VPS
export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/home/marcus_landstrom/FIA/gws-credentials.json
```

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
