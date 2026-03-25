# Scheduler

FIA Gateway anvander en databasdriven scheduler (`DynamicScheduler`) som laser schemalagda jobb fran Supabase-tabellen `scheduled_jobs` och registrerar dem som `node-cron`-tasks.

---

## Arkitektur

```
scheduled_jobs (Supabase)
  ↓ loadAll()
DynamicScheduler
  ↓ node-cron
Trigger → Kill switch-kontroll → Agent pause-kontroll → TaskQueue.enqueue()
  ↓
Agent-exekvering → Slack-notis + activity_log
```

### Hur det fungerar

1. Vid startup anropar gateway `scheduler.loadAll()` som laser alla aktiverade jobb fran `scheduled_jobs`.
2. Varje jobb registreras som en `node-cron`-task med jobbets `cron_expression`.
3. Nar ett cron-jobb triggas kontrolleras forst kill switch och agentens pause-status.
4. Om allt ar klart skapas en task i `TaskQueue` (eller exekveras direkt som fallback).
5. Efter exekvering skickas status till Slack och `activity_log`.

### Hot reload

Nar dashboarden eller CLI andrar ett schemalagt jobb skickas kommandot `update_schedule` via `commands`-tabellen i Supabase. Gateway:ns command-listener fangar detta och anropar `scheduler.reload()` som stoppar alla cron-tasks och laddar om fran databasen.

---

## Standardjobb

Foljande 10 cron-jobb ar seedade som standard:

| Tid | Dagar | Agent | Uppgiftstyp | Cron-uttryck | Prioritet |
|-----|-------|-------|-------------|--------------|-----------|
| 06:30 | Man--fre | Intelligence | `morning_scan` | `30 6 * * 1-5` | normal |
| 07:00 | Man--fre | Analytics | `morning_pulse` | `0 7 * * 1-5` | normal |
| 08:00 | Mandag | Strategy | `weekly_planning` | `0 8 * * 1` | high |
| 09:00 | Man/ons/fre | Content | `scheduled_content` | `0 9 * * 1,3,5` | normal |
| 10:00 | Man--fre | Lead | `lead_scoring` | `0 10 * * 1-5` | normal |
| 11:00 | Tisdag/torsdag | SEO | `keyword_tracking` | `0 11 * * 2,4` | normal |
| 12:30 | Man--fre | Intelligence | `midday_sweep` | `30 12 * * 1-5` | low |
| 14:00 | Fredag | Analytics | `weekly_report` | `0 14 * * 5` | high |
| 15:00 | Onsdag | Campaign | `campaign_review` | `0 15 * * 3` | normal |
| 16:00 | Forsta varje manad | Strategy | `monthly_review` | `0 16 1 * *` | high |

!!! info "Tider i UTC"
    Alla cron-uttryck ar i UTC. `europe-north1` ar UTC+2 (vintertid) / UTC+3 (sommartid). Justera vid behov.

---

## CRUD via triple-interface

Schemalagda jobb kan hanteras via alla tre granssnitt:

| Operation | Dashboard | CLI | Slack |
|-----------|-----------|-----|-------|
| Lista jobb | SchedulerSection (visuell editor) | `fia cron list` | `/fia cron list` |
| Skapa jobb | Formulardialog i SchedulerSection | `fia cron create --agent <slug> --type <type> --cron "<expr>" --title "<titel>"` | `/fia cron create ...` |
| Uppdatera jobb | Inline-redigering i SchedulerSection | `fia cron update <id> --cron "<expr>"` | `/fia cron update ...` |
| Aktivera/inaktivera | Toggle-switch per jobb | `fia cron enable <id>` / `fia cron disable <id>` | `/fia cron enable <id>` |
| Ta bort jobb | Radera-knapp med bekraftelsedialog | `fia cron delete <id>` | `/fia cron delete <id>` |

### Delad affarslogik

All CRUD-logik ar centraliserad i `src/shared/cron-service.ts`. Alla tre granssnitt (Dashboard, CLI, Slack) anropar samma funktioner:

- `listScheduledJobs(supabase)` -- Listar alla jobb med agent-info.
- `createScheduledJob(supabase, input, issuedBy)` -- Skapar nytt jobb med validering.
- `updateScheduledJob(supabase, id, updates, issuedBy)` -- Uppdaterar falt pa ett jobb.
- `deleteScheduledJob(supabase, id, issuedBy)` -- Tar bort ett jobb.
- `enableScheduledJob(supabase, id, issuedBy)` -- Aktiverar ett jobb.
- `disableScheduledJob(supabase, id, issuedBy)` -- Inaktiverar ett jobb.

!!! tip "ID-prefix"
    Du behover inte ange hela UUID:t. `cron-service.ts` stoder prefix-matchning -- ange bara de forsta tecknen i ID:t. Om prefixet matchar flera jobb visas ett felmeddelande.

---

## Validering

Foljande valideras vid skapande och uppdatering:

| Kontroll | Beskrivning |
|----------|-------------|
| Cron-uttryck | Valideras mot `node-cron`. Ogiltiga uttryck avvisas. |
| Prioritet | Maste vara `critical`, `high`, `normal` eller `low`. |
| Uppgiftstyp | Valideras mot agentens tillatna uppgiftstyper via `isSchedulableTaskType()`. |
| Unikhet | Kombinationen agent + task_type + cron-uttryck maste vara unik. |

---

## Kill switch och agent pause

!!! warning "Kill switch"
    Nar kill switch ar aktiv (`system_settings.kill_switch = true`) hoppas **alla** schemalagda jobb over. Schedulern loggar detta men kastar inget fel.

Schedulern respekterar aven individuell agent-paus:

```
Cron triggar → Kill switch aktiv?
  → Ja: Hoppa over, logga
  → Nej: Ar agenten pausad?
    → Ja: Hoppa over, logga
    → Nej: Koa task i TaskQueue
```

Bade kill switch och agent-paus loggas i `activity_log` med action `schedule_skipped`.

---

## Slack-notiser

Schedulern skickar statusmeddelanden till respektive agents Slack-kanal:

| Handelse | Meddelande |
|----------|-----------|
| Task startar | `:rocket: Startar *content* agent (blog_post)... _[schemalagd]_` |
| Task klar | `:white_check_mark: *content* completed. Task: \`<id>\` _[schemalagd]_` |
| Task misslyckas | `:x: *content* misslyckades: <felmeddelande> _[schemalagd]_` |
| Kill switch | Inget meddelande -- loggas tyst. |

### Kanalrouting

| Agent | Slack-kanal |
|-------|------------|
| Content | `#fia-content` |
| Campaign | `#fia-campaigns` |
| Analytics | `#fia-analytics` |
| Intelligence | `#fia-intelligence` |
| Strategy, Lead, SEO, Brand | `#fia-orchestrator` |
