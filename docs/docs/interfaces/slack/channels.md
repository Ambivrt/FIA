# Slack – Kanaler

FIA:s Slack-bot skickar automatiska notiser till dedikerade kanaler baserat på händelsetyp. Kanalstrukturen ger operatörer och Marketing Orchestrators en tydlig överblick utan att behöva logga in i dashboarden.

---

## Kanalstruktur

| Kanal            | Syfte                                         | Volym |
| ---------------- | --------------------------------------------- | ----- |
| `#fia-general`   | Systemhändelser, kill switch, statusändringar | Låg   |
| `#fia-tasks`     | Task-uppdateringar: skapad, slutförd, godkänd | Medel |
| `#fia-approvals` | Tasks som kräver granskning                   | Låg   |
| `#fia-triggers`  | Väntande triggers, trigger-godkännanden       | Låg   |
| `#fia-errors`    | Felmeddelanden, heartbeat-timeout, LLM-fel    | Låg   |
| `#fia-content`   | Färdigt innehåll (publicerat/levererat)       | Medel |

!!! tip "Kanalnamn"
Kanalnamn är konfigurerbara via `system_settings` i Supabase. Ovan är standardkonfigurationen.

---

## Auto-notiser

### Task slutförd

Skickas till `#fia-tasks` när en task byter status till `completed`.

```
✅ Task slutförd
━━━━━━━━━━━━━━━
Agent:    content
Typ:      blog_post
ID:       abc123
Rubrik:   "Hur AI förändrar B2B-marknadsföring"
Score:    0.87
Tid:      2m 34s

Nästa steg: Brand Agent granskar → godkännandekö
```

### Task kräver granskning

Skickas till `#fia-approvals` när en task byter status till `awaiting_review`.

```
👁 Granskning krävs
━━━━━━━━━━━━━━━━━━
Agent:    content
Typ:      blog_post
ID:       abc123
Rubrik:   "Hur AI förändrar B2B-marknadsföring"

Godkänn:  /fia approve abc123
Avvisa:   /fia reject abc123 <feedback>
Dashboard: https://fia.forefront.se/approvals
```

!!! note "Actionable notiser"
Godkännandenotiser inkluderar direktkommandon så att operatören kan agera direkt från Slack utan att öppna dashboarden.

### Trigger avfyrad

Skickas till `#fia-triggers` när en deklarativ trigger avfyras och hamnar i väntande-kö.

```
🔔 Trigger avfyrad
━━━━━━━━━━━━━━━━━
Trigger:  Morgonpuls-rapport
Agent:    analytics
Event:    cron (0 7 * * 1-5)
Åtgärd:   create_task → analytics/daily_report
Status:   Väntande godkännande

Godkänn:  /fia triggers approve trigger-abc123
Avvisa:   /fia triggers reject trigger-abc123
```

### Kill switch aktiverad

Skickas till `#fia-general` vid kill switch-ändring.

```
🚨 KILL SWITCH AKTIVERAD
━━━━━━━━━━━━━━━━━━━━━━━━
Aktiverad av:  anna@forefront.se
Källa:         Dashboard
Tidpunkt:      2026-03-25 09:15:03

Alla agenter stoppas omedelbart.
Återuppta: /fia resume
```

```
✅ Kill switch avaktiverad
━━━━━━━━━━━━━━━━━━━━━━━━
Avaktiverad av: anna@forefront.se
Källa:          Slack
Tidpunkt:       2026-03-25 09:30:00

Agenter återupptar normal drift.
```

### Felmeddelanden

Skickas till `#fia-errors` vid systemfel.

```
⚠️ Fel upptäckt
━━━━━━━━━━━━━━━
Typ:     LLM API Error
Agent:   content
Task:    abc123
Fel:     Rate limit exceeded (429)
Åtgärd:  Exponential backoff retry (försök 2/5)
```

```
🔴 Heartbeat timeout
━━━━━━━━━━━━━━━━━━━━
Agent:   lead
Senaste: 2026-03-25 08:42:01 (>60s sedan)
Status:  offline

Kontrollera: pm2 logs fia-gateway
```

---

## Väntande triggers via Slack

Triggers med `requires_approval: true` i sin konfiguration genererar en notis i `#fia-triggers` och kan godkännas direkt via Slack.

### Flöde

```
1. Trigger-villkor uppfylls (t.ex. cron-schema eller metric_threshold)
2. Gateway skapar rad i pending_triggers-tabellen
3. Slack-notis skickas till #fia-triggers
4. Operatör godkänner via /fia triggers approve <id>
   ELLER avvisar via /fia triggers reject <id>
5. Vid godkännande: åtgärden utförs (t.ex. create_task)
6. Vid avvisande: triggern markeras som rejected
```

```
          ┌──────────────┐
          │ Trigger fires│
          └──────┬───────┘
                 │
          ┌──────▼───────┐
          │ pending_     │
          │ triggers     │
          │ (Supabase)   │
          └──────┬───────┘
                 │
    ┌────────────▼────────────┐
    │ Slack #fia-triggers     │
    │ + Dashboard /triggers   │
    └────────────┬────────────┘
                 │
         ┌───────▼───────┐
         │  Godkänn /    │
         │  Avvisa       │
         └───────┬───────┘
                 │
        ┌────────▼────────┐
        │ Åtgärd utförs   │
        │ (eller avvisad) │
        └─────────────────┘
```

---

## `notify_slack` trigger-åtgärd

Triggers kan konfigureras med åtgärdstypen `notify_slack` för att skicka ett anpassat meddelande till valfri kanal.

### Konfiguration

```yaml
# Exempel i agent.yaml
triggers:
  - name: kpi_alert
    event: metric_threshold
    condition:
      field: bounce_rate
      operator: gt
      value: 5.0
    action:
      type: notify_slack
      channel: "#fia-general"
      message: "⚠️ Bounce rate överstiger 5% – undersök landningssidor."
    requires_approval: false
```

| Fält      | Typ            | Beskrivning                       |
| --------- | -------------- | --------------------------------- |
| `type`    | `notify_slack` | Åtgärdstyp                        |
| `channel` | string         | Slack-kanal att skicka till       |
| `message` | string         | Meddelandetext (stöder variabler) |

### Variabler i meddelanden

| Variabel           | Ersätts med                                |
| ------------------ | ------------------------------------------ |
| `{{agent}}`        | Agentnamn                                  |
| `{{trigger_name}}` | Trigger-namn                               |
| `{{value}}`        | Aktuellt mätvärde (vid `metric_threshold`) |
| `{{threshold}}`    | Tröskelvärde                               |
| `{{timestamp}}`    | Tidsstämpel                                |

!!! example "Variabel-expansion"
`     message: "{{agent}}: {{trigger_name}} – värde {{value}} överstiger tröskel {{threshold}}"
    `
Resulterar i:
`     analytics: kpi_alert – värde 5.3 överstiger tröskel 5.0
    `
