# supabase/ – Datamodell och migreringar

Supabase PostgreSQL (EU-region). Gateway skriver, Dashboard läser via Realtime.

## Tabeller

| Tabell | Syfte | Skrivs av |
|--------|-------|-----------|
| `profiles` | Användare (1:1 med auth.users) | Supabase Auth |
| `agents` | Registret (7 agenter), status, heartbeat | Gateway (heartbeat.ts) |
| `tasks` | Alla agentuppgifter, godkännandeflöde | Gateway (task-writer.ts) |
| `approvals` | Granskningshistorik (Brand Agent + mänskliga) | Gateway + API |
| `metrics` | KPI-data per period | Analytics Agent |
| `activity_log` | Audit trail – alla beslut | Gateway (activity-writer.ts) |

## Nyckelschema

```sql
-- tasks.status-flöde:
-- queued → in_progress → awaiting_review → approved → published
--                                        → rejected (tillbaka till agent)

-- profiles.role:
-- orchestrator | admin | viewer

-- agents.status:
-- active | paused | error | idle

-- agents.autonomy_level:
-- autonomous | semi-autonomous | manual
```

## RLS (Row Level Security)

- **SELECT:** Alla inloggade (`auth.uid() IS NOT NULL`)
- **UPDATE/INSERT:** Enbart `orchestrator` och `admin` (kontrolleras via `profiles.role`)
- RLS är aktiverat på ALLA tabeller

## Gateway → Supabase dataflöde

```
heartbeat.ts      → agents.last_heartbeat (var 60s)
task-writer.ts    → tasks (skapar/uppdaterar vid varje steg)
metrics-writer.ts → metrics (KPI per period)
activity-writer.ts → activity_log (alla agentbeslut)
command-listener.ts ← commands (Realtime, lyssnar på Dashboard-kommandon)
```

## Migreringar

- `migrations/001_initial_schema.sql` – Alla tabeller + RLS + index
- `seed.sql` – De sju agenterna

Vid nya tabeller: skapa ny migreringsfil (002_xxx.sql), aktivera RLS, lägg till policies.
