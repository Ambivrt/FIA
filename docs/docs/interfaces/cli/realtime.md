# CLI – Realtid

FIA CLI erbjuder två realtidskommandon som streamar data direkt från Supabase Realtime till terminalen.

---

## `fia tail`

Live-streamning av `activity_log`-tabellen med färgkodad utskrift.

```bash
# Alla händelser
fia tail

# Filtrera på agent
fia tail --agent content

# Filtrera på nivå
fia tail --level error
```

### Utskriftsformat

Varje loggrad formateras med tidsstämpel, agent, nivå och meddelande:

```
08:45:12 [content]  INFO   Task blog_post startad (task_id: abc123)
08:45:15 [content]  INFO   LLM-anrop: claude-opus-4-6 (1,247 tokens)
08:45:38 [content]  INFO   Task blog_post slutförd (score: 0.87)
08:45:39 [brand]    INFO   Pre-screening startad för abc123
08:45:42 [brand]    WARN   Tonen avviker från riktlinjer (score: 0.62)
08:45:43 [brand]    INFO   Revision begärd: abc123
08:47:01 [system]   ERROR  Heartbeat timeout: lead (>60s)
```

### Färgkodning

| Nivå    | Färg | Beskrivning                    |
| ------- | ---- | ------------------------------ |
| `INFO`  | Grön | Normal aktivitet               |
| `WARN`  | Gul  | Varningar                      |
| `ERROR` | Röd  | Fel                            |
| `DEBUG` | Grå  | Felsökning (dold som standard) |

!!! tip "Avbryt"
Tryck `Ctrl+C` för att stoppa streamningen.

---

## `fia watch`

Live mini-dashboard som visar systemstatus, agenttabell, köstatistik och senaste aktivitet – uppdateras i realtid.

```bash
fia watch
```

### Layout

```
╔═══════════════════════════════════════════════════════╗
║  FIA Watch – Live Dashboard            Ctrl+C = exit ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  System: ● Online    Kill switch: ○ Av                ║
║                                                       ║
║  Agenter:                                             ║
║  ┌───────────┬──────────┬───────────┬────────────┐    ║
║  │ Agent     │ Status   │ Tasks     │ Heartbeat  │    ║
║  ├───────────┼──────────┼───────────┼────────────┤    ║
║  │ content   │ ◉ working│ 3 aktiva  │ 5s         │    ║
║  │ brand     │ ● online │ 0 aktiva  │ 12s        │    ║
║  │ analytics │ ● online │ 1 aktiv   │ 8s         │    ║
║  │ ...       │          │           │            │    ║
║  └───────────┴──────────┴───────────┴────────────┘    ║
║                                                       ║
║  Kö: 3 väntande │ 1 pågående │ 2 granskning          ║
║                                                       ║
║  Senaste aktivitet:                                   ║
║  08:45:38 [content] Task blog_post slutförd           ║
║  08:45:12 [content] Task blog_post startad            ║
║  08:44:01 [analytics] Morgonpuls levererad            ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

### Uppdateringar

| Datakälla         | Uppdateringsfrekvens        |
| ----------------- | --------------------------- |
| Agenttabell       | Realtid (Supabase)          |
| Köstatistik       | Realtid (Supabase)          |
| Senaste aktivitet | Realtid (Supabase)          |
| Heartbeat-timer   | Klientsidigt (1s intervall) |

---

## Supabase Realtime i CLI

Båda realtidskommandona använder `cli/lib/realtime.ts` för att prenumerera på Supabase Realtime-kanaler.

### Arkitektur

```
CLI Process
│
├── Supabase Client (anonym nyckel)
│   └── .channel('activity_log')
│       └── .on('postgres_changes', { event: 'INSERT', table: 'activity_log' })
│           └── callback → formatera och skriv till stdout
│
├── Supabase Client
│   └── .channel('agents')
│       └── .on('postgres_changes', { event: '*', table: 'agents' })
│           └── callback → uppdatera agenttabell (watch)
│
└── Supabase Client
    └── .channel('tasks')
        └── .on('postgres_changes', { event: '*', table: 'tasks' })
            └── callback → uppdatera köstatistik (watch)
```

### Implementering

```typescript
// cli/lib/realtime.ts (förenklad)
import { createClient } from "@supabase/supabase-js";

export function subscribeToActivityLog(
  onEvent: (event: ActivityLogEvent) => void,
  filter?: { agent?: string; level?: string },
): () => void {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const channel = supabase
    .channel("cli-activity-log")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activity_log",
      },
      (payload) => {
        const event = payload.new as ActivityLogEvent;

        // Applicera filter klientsidigt
        if (filter?.agent && event.agent_slug !== filter.agent) return;
        if (filter?.level && event.level !== filter.level) return;

        onEvent(event);
      },
    )
    .subscribe();

  // Returnera unsubscribe-funktion
  return () => {
    supabase.removeChannel(channel);
  };
}
```

### Anslutningshantering

!!! note "Reconnect"
Supabase-klienten hanterar automatisk reconnect vid nätverksavbrott. CLI:t visar ett varningsmeddelande vid frånkoppling och bekräftelse vid återanslutning.

| Händelse     | CLI-beteende                                    |
| ------------ | ----------------------------------------------- |
| Ansluten     | Visar `✓ Ansluten till Supabase Realtime`       |
| Frånkopplad  | Visar `⚠ Frånkopplad – försöker återansluta...` |
| Återansluten | Visar `✓ Återansluten`                          |
| `Ctrl+C`     | Avslutar prenumeration och stänger processen    |

!!! warning "Filtrering"
Filtrering sker **klientsidigt** i CLI:t. Alla events skickas från Supabase och filtreras i callback-funktionen. Vid hög aktivitet kan detta innebära viss overhead.
