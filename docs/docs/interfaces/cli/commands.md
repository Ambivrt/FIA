# CLI – Kommandon

Översikt av alla FIA CLI-kommandon, grupperade efter funktion. Varje kommando beskrivs med syfte och exempelanvändning.

!!! info "Komplett syntax"
    Se [Kommandoreferens](commands-reference.md) för komplett syntax med alla flaggor och alternativ.

---

## System

### `fia status`

Visar systemöversikt: gateway-status, aktiva agenter, köstorlek, kill switch-status.

```bash
fia status
```

```
┌─────────────────────────────────────────┐
│ FIA System Status                       │
├─────────────────────────────────────────┤
│ Gateway:      ● Online                  │
│ Kill switch:  ○ Inaktiv                 │
│ Agenter:      7/7 online                │
│ Tasks i kö:   3                         │
│ Pågående:     1                         │
│ Senaste task: 2026-03-25 08:45:12       │
└─────────────────────────────────────────┘
```

### `fia kill`

Aktiverar kill switch – stoppar alla agenter.

```bash
fia kill --reason "Planerat underhåll"
```

!!! danger "Produktionspåverkan"
    Kill switch stoppar **alla** agenter omedelbart. Pågående tasks pausas. Använd med försiktighet.

### `fia resume`

Avaktiverar kill switch – återupptar alla agenter.

```bash
fia resume
```

---

## Agenter

### `fia agents`

Visar alla agenter i en tabell med status, autonominivå och senaste aktivitet.

```bash
# Lista alla agenter
fia agents

# Visa detaljer för en specifik agent
fia agents content
```

```
┌───────────┬──────────┬─────────────────┬───────────┬──────────────┐
│ Agent     │ Status   │ Autonomi        │ Tasks (24h)│ Heartbeat   │
├───────────┼──────────┼─────────────────┼───────────┼──────────────┤
│ strategy  │ ● online │ semi-autonomous │ 2         │ 15s sedan    │
│ content   │ ◉ working│ autonomous      │ 8         │ 3s sedan     │
│ campaign  │ ● online │ autonomous      │ 1         │ 22s sedan    │
│ seo       │ ● online │ autonomous      │ 4         │ 18s sedan    │
│ lead      │ ● online │ autonomous      │ 0         │ 30s sedan    │
│ analytics │ ● online │ autonomous      │ 5         │ 12s sedan    │
│ brand     │ ● online │ autonomous      │ 6         │ 8s sedan     │
└───────────┴──────────┴─────────────────┴───────────┴──────────────┘
```

### `fia config`

Visa eller redigera agentkonfiguration (routing, verktyg, triggers).

```bash
# Visa routing för content-agenten
fia config content --routing

# Visa alla triggers
fia config content --triggers
```

---

## Tasks

### `fia run`

Starta en task manuellt på en agent.

```bash
fia run content blog_post --priority high
fia run seo keyword_analysis --priority normal
fia run analytics daily_report
```

| Flagga | Beskrivning | Standard |
|--------|------------|----------|
| `--priority` | `low`, `normal`, `high`, `critical` | `normal` |
| `--input` | JSON-sträng med extra input | — |

### `fia queue`

Visa köade och pågående tasks.

```bash
# Alla köade tasks
fia queue

# Filtrera på status
fia queue --status awaiting_review

# Filtrera på agent
fia queue --agent content
```

### `fia approve`

Godkänn en task.

```bash
fia approve abc123
fia approve abc123 --comment "Ser bra ut!"
```

### `fia reject`

Avvisa en task (feedback krävs).

```bash
fia reject abc123 --feedback "Tonen matchar inte varumärket. Se brand guidelines."
```

!!! note "Feedback krävs"
    `--feedback` är obligatorisk vid reject. Feedbacken skickas tillbaka till agenten som input för nästa revision.

---

## Övervakning

### `fia logs`

Visa aktivitetsloggen.

```bash
# Senaste 20 loggrader
fia logs

# Fler rader
fia logs --limit 50

# Filtrera på agent
fia logs --agent brand

# Filtrera på nivå
fia logs --level error
```

### `fia tail`

Live-streamning av aktivitetsloggen via Supabase Realtime. Se [Realtid](realtime.md) för detaljer.

```bash
fia tail
fia tail --agent content
```

### `fia watch`

Live mini-dashboard med agenttabell, köstatistik och senaste aktivitet. Se [Realtid](realtime.md) för detaljer.

```bash
fia watch
```

---

## Automation

### `fia triggers`

Hantera deklarativa triggers och väntande trigger-kö.

```bash
# Lista alla triggers
fia triggers

# Visa väntande triggers
fia triggers --pending

# Godkänn en väntande trigger
fia triggers approve <trigger-id>

# Avvisa en väntande trigger
fia triggers reject <trigger-id> --reason "Inte relevant just nu"
```

### `fia cron`

Hantera schemalagda cron-jobb.

```bash
# Lista alla cron-jobb
fia cron

# Skapa nytt cron-jobb
fia cron create --agent analytics --task daily_report --schedule "0 7 * * 1-5"

# Redigera cron-jobb
fia cron edit <job-id> --schedule "0 8 * * 1-5"

# Aktivera / inaktivera
fia cron enable <job-id>
fia cron disable <job-id>

# Ta bort
fia cron delete <job-id>
```

### `fia lineage`

Visa task-relationer (parent/child-träd).

```bash
fia lineage abc123
```

```
📋 Task Lineage: abc123
│
├── abc123 (content/blog_post) ✓ completed
│   ├── def456 (brand/review) ✓ approved
│   └── ghi789 (seo/optimize) ● in_progress
```

!!! tip "Hierarki"
    `lineage` visar hela kedjan av relaterade tasks via `parent_task_id`. Användbart för att förstå hur en task har bearbetats genom flera agenter.
