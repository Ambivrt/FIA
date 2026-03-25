# Installation

Denna sida beskriver hur du satter upp FIA Gateway lokalt eller pa en server.

---

## Forutsattningar

| Krav             | Version   | Kommentar                         |
| ---------------- | --------- | --------------------------------- |
| Node.js          | >= 20 LTS | Rekommenderat: 22 LTS             |
| npm              | >= 10     | Foljer med Node.js                |
| Git              | >= 2.30   | For att klona repot               |
| Google Cloud SDK | Valfritt  | Behovs enbart for deploy till GCP |

!!! info "Node.js-version"
Gateway ar testad med Node.js 22 LTS. Aldre versioner an 20 stods ej.

---

## Klona repot

=== "Bash"

    ```bash
    git clone git@github.com:ambivrt/fia.git && cd fia
    ```

=== "PowerShell"

    ```powershell
    git clone git@github.com:ambivrt/fia.git; cd fia
    ```

---

## Installera beroenden

=== "Bash"

    ```bash
    npm install
    ```

=== "PowerShell"

    ```powershell
    npm install
    ```

---

## Miljovaribler (.env)

Kopiera `.env.example` och fyll i vardena:

=== "Bash"

    ```bash
    cp .env.example .env
    nano .env
    ```

=== "PowerShell"

    ```powershell
    Copy-Item .env.example .env
    notepad .env
    ```

### LLM-nycklar

| Variabel            | Beskrivning                                                                           | Kravs |
| ------------------- | ------------------------------------------------------------------------------------- | ----- |
| `ANTHROPIC_API_KEY` | Claude API-nyckel (Opus 4.6 + Sonnet 4.6). Primar LLM-leverantor.                     | Ja    |
| `GEMINI_API_KEY`    | Google AI Studio-nyckel. Anvands for Nano Banana 2 (bildgenerering) och textfallback. | Ja    |
| `SERPER_API_KEY`    | Serper.dev API-nyckel for Google-sokresultat. Anvands av SEO och Strategy.            | Nej   |

### Slack

| Variabel               | Beskrivning                                           | Kravs |
| ---------------------- | ----------------------------------------------------- | ----- |
| `SLACK_BOT_TOKEN`      | Bot User OAuth Token (borjar med `xoxb-`).            | Ja    |
| `SLACK_APP_TOKEN`      | App-Level Token for Socket Mode (borjar med `xapp-`). | Ja    |
| `SLACK_SIGNING_SECRET` | Signing Secret fran Slack-appens Basic Information.   | Ja    |

!!! warning "Socket Mode"
FIA anvander Slack Socket Mode (utgaende websocket). `SLACK_APP_TOKEN` maste vara ett App-Level Token med `connections:write`-scope. Utan denna startar inte Slack-integrationen.

### Supabase

| Variabel                    | Beskrivning                                                | Kravs |
| --------------------------- | ---------------------------------------------------------- | ----- |
| `SUPABASE_URL`              | Projekt-URL (`https://<projekt>.supabase.co`).             | Ja    |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side nyckel. Anvands av gateway. Aldrig i frontend. | Ja    |
| `SUPABASE_ANON_KEY`         | Publik nyckel. Anvands av Dashboard.                       | Ja    |

### Google Workspace

| Variabel                                 | Beskrivning                                           | Kravs |
| ---------------------------------------- | ----------------------------------------------------- | ----- |
| `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE`  | Absolut sokvag till credentials JSON (OAuth).         | Nej   |
| `GOOGLE_WORKSPACE_CLI_IMPERSONATED_USER` | Impersonerad anvandare, t.ex. `fia@forefront.se`.     | Nej   |
| `GWORKSPACE_CREDS_DIR`                   | Katalog for `@alanse` MCP-serverns OAuth-credentials. | Nej   |

### CLI

| Variabel        | Beskrivning                                                   | Kravs        |
| --------------- | ------------------------------------------------------------- | ------------ |
| `FIA_CLI_TOKEN` | Lokal auth-token for CLI. Bypass:ar JWT-validering i gateway. | Ja (for CLI) |

### Systeminstallningar

| Variabel                | Standardvarde | Beskrivning                                           |
| ----------------------- | ------------- | ----------------------------------------------------- |
| `NODE_ENV`              | `production`  | `development` aktiverar extra loggning.               |
| `LOG_LEVEL`             | `info`        | Loggniva: `debug`, `info`, `warn`, `error`.           |
| `GATEWAY_API_HOST`      | `127.0.0.1`   | Bind-adress for REST API. Andr aldrig i produktion.   |
| `GATEWAY_API_PORT`      | `3001`        | Intern REST API-port (exponeras ej).                  |
| `QUEUE_MAX_CONCURRENCY` | `3`           | Max antal parallella agentuppgifter.                  |
| `USD_TO_SEK`            | `10.5`        | Fast vaxelkurs USD till SEK for kostnadsrapportering. |

!!! danger "Hemligheter"
Lagg aldrig API-nycklar i kod eller committa `.env`-filen. Den ar gitignored.

---

## Forsta start

### Utvecklingslage (rekommenderat for lokal utveckling)

=== "Bash"

    ```bash
    npm run dev
    ```

=== "PowerShell"

    ```powershell
    npm run dev
    ```

Startar gateway med `ts-node` och filobevakning. Startar om automatiskt vid kodandringar.

### Produktionslage

=== "Bash"

    ```bash
    npm run build && npm start
    ```

=== "PowerShell"

    ```powershell
    npm run build; npm start
    ```

Kompilerar TypeScript till JavaScript (`dist/`) och startar den byggda versionen.

---

## Verifiera

Nar gateway startar korrekt ska loggarna visa foljande:

```
[gateway] API server listening on localhost:3001
[gateway] Slack connected (Socket Mode)
[gateway] Supabase heartbeat: OK
[gateway] Scheduler loaded X jobs from database
```

!!! tip "Felsokningslogg"
Om nagot inte startar, kontrollera:

    - `.env`-filen finns och innehaller korrekta nycklar
    - Supabase-projektet ar aktivt och i EU-region
    - Slack-appen har Socket Mode aktiverat
    - `npm install` har korts utan fel

    Se aven [Felsokning](troubleshooting.md) for vanliga problem.
