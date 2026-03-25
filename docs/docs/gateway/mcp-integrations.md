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
GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/absolute/path/to/credentials.json
GOOGLE_WORKSPACE_CLI_IMPERSONATED_USER=fia@forefront.se
GWORKSPACE_CREDS_DIR=/absolute/path/to/oauth-dir/
```

!!! danger "Absoluta sokvagar"
Anvand alltid absoluta sokvagar. Tilde (`~`) expanderas **inte** korrekt i gws CLI v0.4.4.

### OAuth-exportflow

OAuth-credentials maste exporteras fran Google Cloud Shell och overföras till VPS:en:

1. Oppna [Google Cloud Shell](https://shell.cloud.google.com/)
2. Kor `gws auth login` i Cloud Shell
3. Genomför OAuth-flodet i webblasaren
4. Kopiera genererad `credentials.json` fran Cloud Shell till VPS:en:

=== "Bash"

    ```bash
    # Pa Cloud Shell
    cat ~/.config/gws/credentials.json | base64

    # Pa VPS:en
    echo "<base64-strang>" | base64 -d > /home/user/gws-credentials/credentials.json
    ```

=== "PowerShell"

    ```powershell
    # Pa lokal maskin efter nedladdning fran Cloud Shell
    [System.Convert]::FromBase64String((Get-Content encoded.txt)) | Set-Content credentials.json -AsByteStream
    ```

5. Satt absolut sokvag i `.env`:

```bash
GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/home/user/gws-credentials/credentials.json
```

---

## Kanda buggar i gws CLI v0.4.4

!!! bug "SA-nycklar ignoreras tyst"
Service Account (SA) JSON-nycklar satt via `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` ignoreras tyst av gws CLI v0.4.4. Inga felmeddelanden visas -- anropen misslyckas bara. **Losning:** Anvand OAuth-export fran Cloud Shell istallet.

!!! bug "Tilde expanderas inte"
Sokvagar med `~` (t.ex. `~/credentials.json`) expanderas inte. Anvand alltid absoluta sokvagar.

!!! bug "gws analytics ar inte ett giltigt kommando"
`gws analytics` finns inte i CLI:n. Google Analytics 4-data maste hamtas via direkt API-integration (planerad for Fas 2).

!!! bug "OAuth kravr Cloud Shell"
`gws auth login` fungerar inte pa en headless VPS -- OAuth-flodet kravr en webbläsare. Anvand Cloud Shell for att generera credentials och overfora dem manuellt.

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

| Agent        | Verktyg                                                  |
| ------------ | -------------------------------------------------------- |
| Content      | `buffer`, `gws:drive`, `gws:docs`                        |
| Strategy     | `gws:analytics`, `gws:calendar`, `gws:sheets`, `hubspot` |
| Campaign     | `hubspot`, `linkedin`, `buffer`                          |
| SEO          | `gws:analytics`, `gws:sheets`                            |
| Lead         | `hubspot`                                                |
| Analytics    | `gws:analytics`, `gws:sheets`, `gws:drive`, `hubspot`    |
| Intelligence | `gws:drive`, `gws:docs`, `gws:sheets`                    |
| Brand        | _(inga verktyg)_                                         |

!!! note "Minsta mojliga rattighet"
Varje agent far enbart tillgang till de verktyg den behover. Brand Agent har t.ex. inga verktyg alls -- den granskar enbart innehall.
