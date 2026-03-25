# Systemöversikt

FIA (Forefront Intelligent Automation) är en AI-agentgateway som ersätter Forefronts marknadsavdelning. Sju agentkluster utför operativt marknadsarbete under styrning av 1–2 Marketing Orchestrators.

## Arkitekturdiagram

```mermaid
graph TB
    subgraph Interfaces["Triple-Interface"]
        Slack["Slack\n(Bolt SDK, Socket Mode)"]
        Dashboard["FIA Dashboard PWA\n(React, Supabase Auth)"]
        CLI["FIA CLI\n(Commander, chalk)"]
    end

    subgraph Gateway["FIA Gateway (Node.js daemon, PM2)"]
        Scheduler["Scheduler\n(node-cron + DynamicScheduler)"]
        Router["Router\n(manifest-driven agent.yaml)"]
        TaskQueue["Task Queue\n(in-memory, max 3 concurrent)"]
        SlackHandler["Slack Interface\n(Bolt SDK)"]
        TriggerEngine["Trigger Engine"]
        StatusMachine["Status Machine\n(17 statusar)"]
    end

    subgraph LLM["LLM-klienter"]
        Claude["Anthropic SDK\nClaude Opus 4.6 / Sonnet 4.6"]
        Gemini["Google GenAI\nGemini 2.5 Pro / Flash"]
        NanoBanana["Nano Banana 2\n(bildgenerering)"]
        Serper["Serper.dev API\n(realtidssökning)"]
    end

    subgraph MCP["MCP-servrar"]
        GWS["gws CLI v0.4.4\n(Drive, Docs, Sheets, Calendar)"]
    end

    subgraph Knowledge["Knowledge Base (lokala filer)"]
        AgentYAML["agent.yaml\n(manifest per agent)"]
        Skills["SKILL.md + context/\n(mallar, few-shot)"]
        Brand["brand/\n(plattform, tonalitet, visuell)"]
        Memory["memory/\n(skrivbart per agent)"]
    end

    subgraph Supabase["Supabase (EU PostgreSQL + Auth + Realtime)"]
        DB[(PostgreSQL\neurope-west)]
        Auth["Supabase Auth\n(JWT)"]
        Realtime["Supabase Realtime\n(websocket)"]
    end

    Slack --> SlackHandler
    SlackHandler --> Gateway
    Dashboard -->|REST API| Gateway
    Dashboard -->|JWT| Auth
    Dashboard <-->|Realtime| Realtime
    CLI -->|REST API port 3001| Gateway

    Scheduler --> TaskQueue
    TaskQueue --> Router
    Router --> LLM
    Router --> MCP
    TriggerEngine --> TaskQueue

    Gateway --> Knowledge
    Gateway --> Supabase
    Realtime --> DB

    CLI -->|FIA_CLI_TOKEN| Gateway
```

## Komponenttabell

| Komponent          | Teknologi                                    |
| ------------------ | -------------------------------------------- |
| **Runtime**        | Node.js daemon via PM2                       |
| **Språk**          | TypeScript (strict mode)                     |
| **Scheduler**      | node-cron + DynamicScheduler                 |
| **Task Queue**     | In-memory priority queue, max 3 concurrent   |
| **Slack**          | Bolt SDK, Socket Mode                        |
| **Router**         | Manifest-driven via `agent.yaml`             |
| **LLM primär**     | Anthropic SDK – Claude Opus 4.6 / Sonnet 4.6 |
| **LLM fallback**   | Google GenAI – Gemini 2.5 Pro / Flash        |
| **Bildgenerering** | Nano Banana 2 via Gemini API                 |
| **Sökning**        | Serper.dev API                               |
| **Kontext**        | agent.yaml + markdown + JSON                 |
| **Skills**         | Modulära (`shared:` + `agent:`)              |
| **Loggning**       | Strukturerad JSON → Supabase `activity_log`  |
| **Databas**        | @supabase/supabase-js                        |
| **Realtime**       | Supabase Realtime (websocket)                |
| **REST API**       | Express, intern port 3001                    |
| **CLI**            | Commander + chalk + boxen + ora + cli-table3 |
| **Validering**     | Zod                                          |
| **Status Machine** | `status-machine.ts` (17 statusar)            |
| **Trigger Engine** | `trigger-engine.ts` (deklarativ)             |
| **GWS**            | gws CLI v0.4.4 via MCP                       |
| **Hosting**        | GCP Compute Engine europe-north1-b           |

## Designprinciper

### Human on the Loop

Agenter beslutar och exekverar inom definierade ramar. Orchestratorn sätter riktning och godkänner – men behöver inte styra varje steg. Systemet är designat för att köra autonomt med mänsklig uppsikt, inte mänsklig styrning.

### Manifest-driven agents

Varje agent styrs av sin `agent.yaml` – modellval, kontextladdning, verktyg, autonominivå och triggers. Ingen hårdkodning i TypeScript. Beteendeförändringar görs i YAML, inte i kod.

### Headless arkitektur

Frontend och backend är fullständigt separerade. Dashboard PWA kommunicerar **aldrig** direkt med gateway-processen.

```mermaid
sequenceDiagram
    participant D as Dashboard PWA
    participant EF as Supabase Edge Function
    participant DB as Supabase PostgreSQL
    participant GW as FIA Gateway

    D->>EF: Kommando (JWT)
    EF->>EF: Validera JWT + roll
    EF->>DB: INSERT INTO commands
    DB-->>GW: Realtime notification
    GW->>GW: Exekvera kommando
    GW->>DB: UPDATE agents/tasks
    DB-->>D: Realtime → live-uppdatering
```

!!! info "Kommunikationsvägar" - **REST API** – Dashboard och CLI anropar `/api/*` endpoints (port 3001) - **Supabase Auth** – JWT-validering för Dashboard-användare - **Supabase Realtime** – Websocket-prenumerationer för live-uppdateringar - **Commands-tabell** – Dashboard skriver kommandon, Gateway lyssnar via Realtime

### Triple-Interface

FIA exponeras genom tre parallella gränssnitt:

| Gränssnitt        | Användning                                  | Teknik                   |
| ----------------- | ------------------------------------------- | ------------------------ |
| **Slack**         | Kommandon, notifieringar, eskaleringar      | Bolt SDK, Socket Mode    |
| **Dashboard PWA** | Grafisk vy, godkännandekö, KPI, kill switch | React, Supabase Realtime |
| **FIA CLI**       | Terminalverktyg för SSH/lokal access        | Commander, chalk         |

!!! note "Ingen gateway-exponering"
Gateway-processen är **inte** exponerad mot internet. Slack använder Socket Mode (utgående websocket), Dashboard går via Supabase, och CLI ansluter till intern port 3001.
