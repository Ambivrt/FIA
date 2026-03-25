# Dashboard – Agenter

Agentsidorna ger en grafisk överblick över alla sju agenter, deras status, konfiguration och aktivitet.

---

## AgentsListPage (`/agents`)

Visar ett rutnät med agentkort. Varje kort visar:

- **Agentnamn och slug** (t.ex. Content Agent – `content`)
- **Display status** med färgkodad indikator
- **Senaste heartbeat** (relativ tid)
- **Pågående tasks** (antal)
- **Autonominivå** (`autonomous` / `semi-autonomous`)

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 🟢 Content Agent │  │ 🟡 Brand Agent   │  │ 🟢 SEO Agent     │
│ autonomous       │  │ working          │  │ autonomous       │
│ 3 aktiva tasks   │  │ 1 granskning     │  │ 0 aktiva tasks   │
│ Heartbeat: 12s   │  │ Heartbeat: 3s    │  │ Heartbeat: 45s   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

!!! note "Realtidsuppdatering"
Agentkorten uppdateras i realtid via Supabase Realtime-prenumeration på `agents`-tabellen. Heartbeat-timern räknas upp klientsidigt.

---

## AgentDetailPage (`/agents/:slug`)

Detaljvy för en enskild agent med fyra flikar:

### Flik 1: Översikt

| Fält                | Beskrivning                            |
| ------------------- | -------------------------------------- |
| Display status      | Aktuell status med färgad badge        |
| Heartbeat           | Senaste heartbeat-tidsstämpel + uptime |
| Tasks (senaste 24h) | Antal slutförda, pågående, misslyckade |
| Genomsnittlig tid   | Medeltid per task-typ                  |
| Autonominivå        | `autonomous` eller `semi-autonomous`   |
| Senaste aktivitet   | De 5 senaste loggraderna               |

### Flik 2: Routing

Visar agentens LLM-routing (från `agent.yaml` → `config_json`). Varje uppgiftstyp mappas till en modell.

| Uppgiftstyp   | Modell              | Redigerbar |
| ------------- | ------------------- | ---------- |
| `blog_post`   | `claude-opus-4-6`   | Ja         |
| `social_post` | `claude-sonnet-4-6` | Ja         |
| `metadata`    | `claude-sonnet-4-6` | Ja         |

!!! warning "Routing-ändringar"
Ändringar i routing sparas till `config_json` i Supabase, inte till `agent.yaml`. Gatewayen läser `config_json` vid nästa task. Ändringar kräver rollen `admin` eller `orchestrator`.

### Flik 3: Verktyg (Tools)

Lista över MCP-verktyg som agenten har tillgång till:

| Verktyg                  | MCP-server | Status  |
| ------------------------ | ---------- | ------- |
| `google_docs_create`     | gws        | Aktiv   |
| `google_sheets_read`     | gws        | Aktiv   |
| `hubspot_contact_search` | hubspot    | Inaktiv |

Verktyg kan aktiveras/inaktiveras per agent. Ändringar sparas i `config_json.tools`.

### Flik 4: Triggers

Visar agentens deklarativa triggers via `AgentTriggersTab`-komponenten.

```typescript
// AgentTriggersTab-props
interface AgentTriggersTabProps {
  agentSlug: string;
  triggers: Trigger[];
  onToggle: (triggerId: string, enabled: boolean) => void;
  onEdit: (trigger: Trigger) => void;
}
```

Varje trigger visas som ett `TriggerCard` med:

- **Namn och beskrivning**
- **Event-typ** (badge: `cron`, `task_completed`, `metric_threshold`, etc.)
- **Villkor** (condition-sumering)
- **Åtgärd** (action-typ)
- **Enable/disable-toggle**

---

## Display Status

Display status är en gemensam standard som används av Dashboard, CLI och Slack. Logiken definieras i `src/shared/display-status.ts`.

### Resolve-logik

```
1. Kill switch aktiv?           → killed (röd)
2. Agent pausad?                → paused (gul)
3. Agent har error?             → error (röd)
4. Agent har pågående task?     → working (gul/pulserande)
5. Heartbeat inom 60s?          → online (grön)
6. Annars                       → offline (grå)
```

### Färgmappning

| Status    | Färg             | Ikon             | CSS-klass                       |
| --------- | ---------------- | ---------------- | ------------------------------- |
| `online`  | Grön (`#22c55e`) | `●`              | `text-green-500`                |
| `working` | Gul (`#eab308`)  | `◉` (pulserande) | `text-yellow-500 animate-pulse` |
| `paused`  | Gul (`#eab308`)  | `◎`              | `text-yellow-500`               |
| `killed`  | Röd (`#ef4444`)  | `■`              | `text-red-500`                  |
| `error`   | Röd (`#ef4444`)  | `✖`              | `text-red-500`                  |
| `offline` | Grå (`#6b7280`)  | `○`              | `text-gray-500`                 |

---

## Pausa / återuppta agent

Orchestrators och admins kan pausa och återuppta enskilda agenter direkt från AgentDetailPage.

!!! example "Pausa en agent" 1. Gå till `/agents/content` 2. Klicka **Pausa agent** i sidhuvudet 3. Bekräfta i dialogen 4. Agentens status ändras till `paused` 5. Pågående tasks körs klart men inga nya startas

!!! tip "Skillnad mot kill switch"
**Pausa** stoppar en enskild agent. **Kill switch** stoppar alla agenter samtidigt. Kill switch aktiveras via Inställningar eller Slack.
