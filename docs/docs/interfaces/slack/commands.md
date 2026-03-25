# Slack – Kommandon

FIA:s Slack-bot exponerar alla viktiga funktioner som slash-kommandon via `/fia`. Boten körs med **Socket Mode** – ingen publik URL krävs.

!!! info "Socket Mode"
Socket Mode använder WebSocket istället för HTTP-webhooks. FIA:s gateway ansluter direkt till Slack via `SLACK_APP_TOKEN`. Detta innebär att boten fungerar bakom brandväggar och NAT utan att exponera en publik endpoint.

---

## Kommandoöversikt

| Kommando                                     | Beskrivning                              |
| -------------------------------------------- | ---------------------------------------- |
| `/fia status`                                | Systemöversikt: agenter, kö, kill switch |
| `/fia kill`                                  | Aktivera kill switch                     |
| `/fia resume`                                | Avaktivera kill switch                   |
| `/fia run <agent> <task>`                    | Starta en task manuellt                  |
| `/fia approve <task-id>`                     | Godkänn en task                          |
| `/fia reject <task-id> <feedback>`           | Avvisa en task med feedback              |
| `/fia queue`                                 | Visa köade och pågående tasks            |
| `/fia triggers`                              | Lista väntande triggers                  |
| `/fia triggers approve <id>`                 | Godkänn en väntande trigger              |
| `/fia triggers reject <id>`                  | Avvisa en väntande trigger               |
| `/fia cron`                                  | Lista schemalagda cron-jobb              |
| `/fia cron create <agent> <task> <schedule>` | Skapa nytt cron-jobb                     |
| `/fia cron edit <id> <schedule>`             | Redigera cron-schema                     |
| `/fia cron delete <id>`                      | Ta bort cron-jobb                        |
| `/fia cron enable <id>`                      | Aktivera cron-jobb                       |
| `/fia cron disable <id>`                     | Inaktivera cron-jobb                     |
| `/fia lineage <task-id>`                     | Visa task-relationer (parent/child)      |

---

## System

### `/fia status`

Visar en sammanfattning av systemets tillstånd.

```
/fia status
```

Svar (ephemeral):

```
🟢 FIA System Status
━━━━━━━━━━━━━━━━━━━
Gateway:     Online
Kill switch: Av
Agenter:     7/7 online
Tasks i kö:  3
Pågående:    1
```

### `/fia kill`

```
/fia kill
```

!!! danger "Stoppar alla agenter"
Kill switch påverkar alla agenter omedelbart. En bekräftelse krävs innan aktivering.

Svar:

```
⚠️ Kill switch AKTIVERAD
Alla agenter stoppas. Använd /fia resume för att återuppta.
Aktiverad av: @anna
```

### `/fia resume`

```
/fia resume
```

Svar:

```
✅ Kill switch avaktiverad
Alla agenter återupptar normal drift.
```

---

## Tasks

### `/fia run`

```
/fia run content blog_post
/fia run analytics daily_report
```

| Parameter | Beskrivning                     | Obligatorisk |
| --------- | ------------------------------- | ------------ |
| `agent`   | Agent-slug (t.ex. `content`)    | Ja           |
| `task`    | Uppgiftstyp (t.ex. `blog_post`) | Ja           |

Svar:

```
📋 Task skapad
Agent:  content
Typ:    blog_post
ID:     abc123-def456
Status: queued
```

### `/fia approve`

```
/fia approve abc123
```

Svar:

```
✅ Task abc123 godkänd
Status: awaiting_review → approved
```

### `/fia reject`

```
/fia reject abc123 Tonen är för formell. Skriv mer personligt.
```

| Parameter  | Beskrivning                       | Obligatorisk |
| ---------- | --------------------------------- | ------------ |
| `task-id`  | Task-ID (UUID eller kort-ID)      | Ja           |
| `feedback` | Fritext med feedback till agenten | Ja           |

Svar:

```
↩️ Task abc123 avvisad
Feedback: "Tonen är för formell. Skriv mer personligt."
Status: awaiting_review → revision_requested
```

### `/fia queue`

```
/fia queue
```

Svar:

```
📋 Task-kö (5 tasks)
━━━━━━━━━━━━━━━━━━━
1. abc123  content   blog_post        ● in_progress
2. def456  brand     review           ● in_progress
3. ghi789  seo       keyword_analysis ⏳ queued
4. jkl012  analytics daily_report     ⏳ queued
5. mno345  content   social_post      👁 awaiting_review
```

---

## Triggers

### `/fia triggers`

Visar väntande triggers som kräver godkännande.

```
/fia triggers
```

### `/fia triggers approve <id>`

```
/fia triggers approve trigger-abc123
```

Svar:

```
✅ Trigger trigger-abc123 godkänd
Åtgärd utförs: create_task → analytics/weekly_summary
```

### `/fia triggers reject <id>`

```
/fia triggers reject trigger-abc123
```

---

## Cron

### `/fia cron`

Lista alla schemalagda jobb.

```
/fia cron
```

Svar:

```
📅 Schemalagda jobb (3 st)
━━━━━━━━━━━━━━━━━━━━━━━
1. Morgonpuls     analytics  daily_report    0 7 * * 1-5   ✅ aktiv
2. Veckosammanf.  analytics  weekly_summary  0 9 * * 1     ✅ aktiv
3. SEO-audit      seo        site_audit      0 6 1 * *     ⏸ inaktiv
```

### `/fia cron create`

```
/fia cron create analytics daily_report "0 7 * * 1-5"
```

### `/fia cron edit`

```
/fia cron edit <job-id> "0 8 * * 1-5"
```

### `/fia cron enable / disable / delete`

```
/fia cron enable <job-id>
/fia cron disable <job-id>
/fia cron delete <job-id>
```

---

## Lineage

### `/fia lineage`

```
/fia lineage abc123
```

Svar:

```
📋 Task Lineage: abc123

abc123 (content/blog_post) ✓ completed
├── def456 (brand/review) ✓ approved
└── ghi789 (seo/optimize) ● in_progress
```

!!! tip "Korta ID:n"
Slack-kommandon accepterar både fullständiga UUID:n och korta ID:n (första 6 tecknen). Gatewayen söker automatiskt efter matchande task.
