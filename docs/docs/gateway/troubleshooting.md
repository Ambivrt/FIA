# Felsokning

Vanliga problem och losningar for FIA Gateway.

---

## Slack-anslutning

### Symptom

Gateway startar men Slack-kommandon (`/fia status`) ger inget svar.

### Orsaker och losningar

| Problem                               | Losning                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `SLACK_APP_TOKEN` saknas eller ar fel | Socket Mode kravr ett App-Level Token (borjar med `xapp-`). Generera i Slack-appens **Socket Mode**-sida med scope `connections:write`. |
| `SLACK_BOT_TOKEN` saknas              | Bot User OAuth Token (borjar med `xoxb-`). Installera appen i workspacen under **OAuth & Permissions**.                                 |
| `SLACK_SIGNING_SECRET` saknas         | Finns under **Basic Information** i Slack-appen.                                                                                        |
| Socket Mode inte aktiverat            | Ga till Slack-appens **Socket Mode**-sida och aktivera det.                                                                             |
| Bot saknar scopes                     | Kontrollera att boten har: `chat:write`, `commands`, `channels:history`, `channels:read`, `groups:read`.                                |

!!! tip "Diagnostik"
Kontrollera Bolt SDK-loggar i PM2:

    ```bash
    pm2 logs fia-gateway --lines 100 | grep -i slack
    ```

    Leta efter `Slack connected` eller felmeddelanden fran Bolt SDK.

---

## Supabase Realtime

### Symptom

Dashboard visar inte uppdateringar i realtid. Tasks och agentstatus uppdateras inte live.

### Orsaker och losningar

| Problem                            | Losning                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` ar fel | Service Role Key har full atkomst. Kontrollera under **Settings → API** i Supabase-dashboarden. |
| Publication saknar tabeller        | Supabase Realtime kravr att tabellerna ar tillagda i publikationen. Kor i SQL Editor:           |

```sql
-- Kontrollera vilka tabeller som ar i publikationen
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Lagg till tabeller vid behov
ALTER PUBLICATION supabase_realtime ADD TABLE tasks, agents, activity_log, commands;
```

!!! note "EU-region"
Supabase-projektet maste vara i EU-region. Data far aldrig lamna EU.

---

## gws OAuth-fel

### Symptom

GWS-verktyg (Drive, Docs, Sheets) returnerar auth-fel eller tomma resultat.

### Orsaker och losningar

!!! bug "Service Account-nycklar fungerar inte"
gws CLI v0.4.4 ignorerar tyst SA JSON-nycklar. Inga felmeddelanden visas -- anropen misslyckas bara. **Du maste anvanda OAuth-export fran Cloud Shell.**

| Problem                      | Losning                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| SA-nyckel istallet for OAuth | Folj [OAuth-exportflödet](mcp-integrations.md#oauth-exportflow).                              |
| Tilde (`~`) i sokvag         | Anvand absolut sokvag: `/home/user/creds/credentials.json` (inte `~/creds/credentials.json`). |
| OAuth-token har gatt ut      | Kor `gws auth login` i Cloud Shell och exportera ny `credentials.json`.                       |
| `gws analytics` ger fel      | `gws analytics` ar inte ett giltigt CLI-kommando. GA4-data via direkt API i Fas 2.            |

---

## PM2-processen startar inte

### Symptom

`pm2 start ecosystem.config.js` misslyckas eller processen kraschar omedelbart.

### Orsaker och losningar

| Problem                | Losning                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `dist/index.js` saknas | Bygg forst: `npm run build`                                                           |
| Fel Node.js-version    | Kontrollera: `node --version` (kravr >= 20). Installera 22 LTS.                       |
| `.env` saknas          | Gateway kraschar vid startup om `.env` inte finns. Kopiera fran `.env.example`.       |
| Port redan upptagen    | Kontrollera om port 3001 anvands: `lsof -i :3001`. Andra `GATEWAY_API_PORT` i `.env`. |
| Minnesgransen nadd     | PM2 startar om vid 512 MB. Kontrollera `pm2 monit` for minnesanvandning.              |

!!! tip "Diagnostik"

````bash # Visa processens status
pm2 status

    # Visa senaste loggarna (inklusive crash-loggar)
    pm2 logs fia-gateway --lines 50

    # Visa detaljerad processinformation
    pm2 describe fia-gateway
    ```

---

## Modell-timeout och rate limits

### Symptom

Tasks fastnar i `in_progress` eller misslyckas med timeout-fel.

### Orsaker och losningar

| Problem                        | Losning                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` ar ogiltig | Kontrollera nyckeln pa [console.anthropic.com](https://console.anthropic.com/).                                             |
| Rate limit nadd                | Claude API har rate limits per organisation. Gateway har exponential backoff retry som hanterar transienta fel automatiskt. |
| Timeout pa stora prompter      | Kontrollera `system_context` och `task_context` i agentens `agent.yaml`. Stora kontextfiler okar latens och kostnad.        |

!!! info "Exponential backoff"
Gateway har inbyggd retry med exponential backoff for transienta LLM-fel (rate limits, timeout, natverksfel). Upp till 3 forsök med okande vantetid. Permanenta fel (401, 403) provas inte om.

---

## Kill switch fastnar

### Symptom

Kill switch ar aktiv men kan inte inaktiveras via Dashboard, CLI eller Slack.

### Losning

Kill switch lagras i `system_settings`-tabellen i Supabase:

```sql
-- Kontrollera kill switch-status
SELECT * FROM system_settings WHERE key = 'kill_switch';

-- Inaktivera manuellt
UPDATE system_settings SET value = 'false', updated_at = NOW() WHERE key = 'kill_switch';
````

=== "CLI"

    ```bash
    npx fia resume
    ```

=== "Slack"

    ```
    /fia resume
    ```

!!! warning "Nödsituation"
Om varken Dashboard, CLI eller Slack fungerar, anvand Supabase SQL Editor direkt for att inaktivera kill switch.

---

## Tasks fastnar i in_progress

### Symptom

Tasks har status `in_progress` men ingen agent arbetar pa dem. Vanligt efter en gateway-krasch.

### Orsaker och losningar

| Problem                            | Losning                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Gateway kraschade under exekvering | Vid startup gor gateway en recovery-kontroll: alla tasks som ar `in_progress` utan aktiv exekvering markeras som `error`. |
| Agent ar pausad                    | Kontrollera agentens status i Dashboard eller via `npx fia agents`.                                                       |
| TaskQueue ar full                  | `QUEUE_MAX_CONCURRENCY` begransar parallella tasks (standard: 3). Kontrollera kon: `npx fia queue`.                       |

!!! tip "Manuell recovery"
Om automatisk recovery inte fungerar, uppdatera statusen manuellt i Supabase:

    ```sql
    UPDATE tasks
    SET status = 'error', updated_at = NOW()
    WHERE status = 'in_progress'
      AND updated_at < NOW() - INTERVAL '1 hour';
    ```

---

## CLI-autentisering misslyckas

### Symptom

CLI-kommandon (`npx fia status`) returnerar `401 Unauthorized`.

### Orsaker och losningar

| Problem                                    | Losning                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `FIA_CLI_TOKEN` saknas i gateway:ns `.env` | Lagg till en token i `.env` pa servern: `FIA_CLI_TOKEN=<din-token>`           |
| Token matchar inte                         | CLI:ns konfigurerade token maste matcha exakt med gateway:ns `FIA_CLI_TOKEN`. |
| CLI pekar pa fel host                      | Kontrollera CLI-konfigurationen: `npx fia config`                             |

=== "Bash"

    ```bash
    # Satt CLI-token
    npx fia config set token <din-token>

    # Satt gateway-host (om ej localhost)
    npx fia config set host http://<ip>:3001
    ```

=== "PowerShell"

    ```powershell
    npx fia config set token <din-token>
    npx fia config set host http://<ip>:3001
    ```

!!! info "Auth-bypass"
`FIA_CLI_TOKEN` ar en enkel bearer-token som bypass:ar JWT-validering i gateway:ns auth middleware. Tokenen ger automatiskt admin-roll.

---

## Snabbreferens -- diagnostikkommandon

| Kommando                          | Beskrivning                        |
| --------------------------------- | ---------------------------------- |
| `pm2 status`                      | Processens status                  |
| `pm2 logs fia-gateway --lines 50` | Senaste loggarna                   |
| `pm2 monit`                       | CPU/minne i realtid                |
| `npx fia status`                  | Systemstatus via CLI               |
| `npx fia agents`                  | Agentstatus                        |
| `npx fia queue`                   | Koade/pagaende tasks               |
| `npx fia logs`                    | Aktivitetslogg                     |
| `npx fia tail`                    | Live-stream fran Supabase Realtime |
