# Dashboard – Triggers

Trigger-sidorna hanterar FIA:s deklarativa trigger engine – från godkännandekö för väntande triggers till systemövergripande konfiguration.

---

## TriggersPage (`/triggers`)

Visar kön med **väntande triggers** – triggers som har avfyrats men kräver manuellt godkännande innan åtgärden utförs.

### Kolumner

| Kolumn       | Beskrivning                             |
| ------------ | --------------------------------------- |
| Trigger-namn | Namn från trigger-definitionen          |
| Agent        | Vilken agent som äger triggern          |
| Event        | Händelsen som utlöste triggern          |
| Villkor      | Sammanfattning av condition-matchningen |
| Åtgärd       | Vad som händer vid godkännande          |
| Tidsstämpel  | När triggern avfyrades                  |
| Åtgärder     | Godkänn / Avvisa-knappar                |

### Godkänna / avvisa väntande trigger

```typescript
// API-anrop vid godkännande
await supabase.from("pending_triggers").update({ status: "approved", approved_by: user.id }).eq("id", triggerId);
```

!!! info "Tabellen `pending_triggers`"
Väntande triggers lagras i `pending_triggers`-tabellen i Supabase. Varje rad innehåller trigger-definitionen, matchade villkor och den föreslagna åtgärden. Statusfältet kan vara `pending`, `approved` eller `rejected`.

---

## TriggersConfigPage (`/triggers/config`)

Systemövergripande översikt och konfiguration av alla triggers i systemet.

### Filter

| Filter    | Alternativ                                             |
| --------- | ------------------------------------------------------ |
| Agent     | Alla / enskild agent                                   |
| Event-typ | `cron`, `task_completed`, `metric_threshold`, `manual` |
| Status    | Aktiv / Inaktiv                                        |

### Trigger-lista

Varje trigger visas med:

- **Namn och beskrivning**
- **Agent-tillhörighet**
- **Event-badge** (färgkodad per event-typ)
- **Enable/disable-toggle**
- **Redigera-knapp** (öppnar editor)

---

## Komponenter

### AgentTriggersTab

Flik i `AgentDetailPage` som visar alla triggers för en specifik agent. Använder `TriggerCard` för varje trigger.

### TriggerCard

Kompakt kort som visar en enskild trigger:

```
┌─────────────────────────────────────────────────────┐
│ 📅 Morgonpuls-rapport                    [Aktiv ●]  │
│                                                     │
│ Event: cron (0 7 * * 1-5)                           │
│ Villkor: —                                          │
│ Åtgärd: create_task → analytics/daily_report        │
│                                                     │
│ [Redigera]                                          │
└─────────────────────────────────────────────────────┘
```

### TriggerConditionEditor

Formulär för att redigera trigger-villkor:

| Fält       | Typ    | Beskrivning                                |
| ---------- | ------ | ------------------------------------------ |
| `field`    | Select | Vilken datapunkt som utvärderas            |
| `operator` | Select | `eq`, `gt`, `lt`, `gte`, `lte`, `contains` |
| `value`    | Input  | Jämförelsevärde                            |
| `logic`    | Select | `AND` / `OR` (vid flera villkor)           |

### TriggerActionEditor

Formulär för att redigera trigger-åtgärd:

| Fält        | Typ    | Beskrivning                                                |
| ----------- | ------ | ---------------------------------------------------------- |
| `type`      | Select | `create_task`, `notify_slack`, `update_config`, `escalate` |
| `agent`     | Select | Målagent (vid `create_task`)                               |
| `task_type` | Input  | Uppgiftstyp (vid `create_task`)                            |
| `channel`   | Input  | Slack-kanal (vid `notify_slack`)                           |
| `priority`  | Select | `low`, `normal`, `high`, `critical`                        |

### TriggerEventBadge

Visar event-typ med färgkodad badge:

| Event-typ          | Färg   | Exempel                 |
| ------------------ | ------ | ----------------------- |
| `cron`             | Blå    | Schemalagd körning      |
| `task_completed`   | Grön   | Task slutförd           |
| `metric_threshold` | Orange | KPI-tröskel överskriden |
| `manual`           | Grå    | Manuellt utlöst         |

### TriggerApprovalBadge

Visar godkännandestatus för väntande triggers:

| Status     | Färg |
| ---------- | ---- |
| `pending`  | Gul  |
| `approved` | Grön |
| `rejected` | Röd  |

---

## Reseed från YAML

!!! warning "Endast admin"
Reseed-funktionen kräver rollen `admin` eller `orchestrator`.

Triggers seedas initialt från `agent.yaml` vid gateway-startup. Därefter äger dashboarden konfigurationen via `config_json` i Supabase. Om `agent.yaml` uppdaterats (t.ex. vid deploy) kan admin trigga en **reseed**.

### Flöde

```
1. Admin klickar "Reseed från YAML" i TriggersConfigPage
2. Gateway kör dry-run: jämför YAML-triggers mot config_json
3. Diff visas i bekräftelsedialog:
   - Nya triggers (läggs till)
   - Ändrade triggers (uppdateras)
   - Borttagna triggers (markeras)
4. Admin bekräftar eller avbryter
5. Vid bekräftelse: config_json uppdateras i Supabase
```

!!! example "Dry-run diff"
`diff
    + analytics/weekly_summary (ny trigger)
    ~ strategy/quarterly_review: cron ändrad 0 9 1 */3 * → 0 8 1 */3 *
    - seo/legacy_audit (borttagen i YAML)
    `

    Adminen ser exakt vilka ändringar som kommer att göras innan bekräftelse.
