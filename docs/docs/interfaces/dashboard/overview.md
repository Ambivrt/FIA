# Dashboard – Översikt

FIA Dashboard är en **Progressive Web App (PWA)** som ger Marketing Orchestrators och operatörer en grafisk vy över hela agentsystemet. Dashboarden körs på `fia.forefront.se` och synkar i realtid mot Supabase.

---

## Teknikstack

| Komponent | Teknologi | Version |
|-----------|-----------|---------|
| UI-ramverk | React | 18.3 |
| Bundler | Vite (SWC) | 5.4 |
| Språk | TypeScript strict | 5.8 |
| Styling | Tailwind CSS + shadcn/ui (Radix) | 3.4 |
| Server state | TanStack React Query | 5.83 |
| Routing | React Router DOM | 6.30 |
| Formulär | React Hook Form + Zod | — |
| Grafer | Recharts | — |
| Ikoner | Lucide React | — |
| i18n | i18next | — |
| Databas-klient | @supabase/supabase-js | 2.99 |

---

## Komponentstruktur

```
src/
├── components/          # Delade UI-komponenter (shadcn/ui + custom)
│   ├── ui/              # shadcn/ui primitiver (Button, Dialog, Sheet, etc.)
│   ├── agents/          # AgentCard, AgentStatusBadge, AgentTriggersTab
│   ├── tasks/           # TaskDetailSheet, TaskStatusBadge, TaskTable
│   ├── triggers/        # TriggerCard, TriggerConditionEditor, TriggerActionEditor
│   └── layout/          # Sidebar, Header, MobileNav
├── pages/               # En sida per route
├── contexts/            # AuthContext, ThemeContext
├── hooks/               # useAgents, useTasks, useTriggers, useRealtime, etc.
├── services/            # API-anrop, Supabase-klient
└── lib/                 # Utility-funktioner, konstanter
```

!!! tip "shadcn/ui"
    Alla primitiva UI-komponenter (knappar, dialoger, tabeller, badges) kommer från shadcn/ui som bygger på Radix UI. Komponenterna kopieras in i `src/components/ui/` och anpassas med Tailwind-klasser.

---

## Routing

| Route | Sida | Beskrivning |
|-------|------|-------------|
| `/login` | LoginPage | Supabase Auth (magic link / OAuth) |
| `/install` | InstallPage | PWA-installationsguide |
| `/` | DashboardPage | Systemöversikt med KPI:er och agentpuls |
| `/agents` | AgentsListPage | Rutnät med agentkort |
| `/agents/:slug` | AgentDetailPage | Agentdetaljer med flikar |
| `/approvals` | ApprovalsPage | Godkännandekö (tasks med `awaiting_review`) |
| `/triggers` | TriggersPage | Väntande triggers-kö |
| `/triggers/config` | TriggersConfigPage | Trigger-konfiguration per agent |
| `/calendar` | CalendarPage | Innehållskalender |
| `/activity` | ActivityPage | Aktivitetslogg |
| `/settings` | SettingsPage | Kill switch, tema, roller |
| `/costs` | CostsPage | LLM-kostnadsöversikt |

!!! note "Skyddade routes"
    Alla routes utom `/login` och `/install` kräver autentisering via `AuthContext`. Obehöriga omdirigeras automatiskt till `/login`.

---

## State management

Dashboarden använder tre lager för tillståndshantering:

### 1. Server state – TanStack React Query

```typescript
// Exempel: hämta alla agenter
const { data: agents, isLoading } = useQuery({
  queryKey: ['agents'],
  queryFn: () => supabase.from('agents').select('*'),
  staleTime: 30_000,
});
```

- Automatisk caching och revalidering
- Optimistic updates vid approve/reject
- `staleTime` anpassat per datakälla

### 2. React Context – Auth + Theme

| Context | Ansvar |
|---------|--------|
| `AuthContext` | Inloggningsstatus, JWT, roll, Supabase-session |
| `ThemeContext` | Aktivt färgschema, ljus/mörkt läge |

### 3. Realtime sync – Supabase PostgreSQL Changes

```typescript
// Prenumeration på task-uppdateringar
supabase
  .channel('tasks')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks',
  }, (payload) => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  })
  .subscribe();
```

!!! info "Realtime-synk"
    Supabase Realtime lyssnar på `INSERT`, `UPDATE` och `DELETE` events på tabellerna `tasks`, `agents`, `pending_triggers` och `system_settings`. Vid förändring invalideras relevanta React Query-cacher automatiskt.

---

## PWA

Dashboarden är installbar som PWA på desktop och mobil.

| Funktion | Implementation |
|----------|---------------|
| Service worker | Workbox (precache + runtime caching) |
| Manifest | `manifest.json` med Forefront-ikoner |
| Offline-stöd | Cachad shell + offline-fallback |
| Uppdatering | Prompt vid ny version tillgänglig |

```json
{
  "name": "FIA Dashboard",
  "short_name": "FIA",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#7D5365"
}
```

---

## Temasystem

Dashboarden erbjuder **5 färgscheman × 2 lägen = 10 kombinationer**.

| Färgschema | Primärfärg | Beskrivning |
|------------|-----------|-------------|
| Earth | `#7D5365` | Forefront-palett (standard) |
| Ocean | `#555977` | Blålila toner |
| Forest | `#42504E` | Gröna toner |
| Sand | `#756256` | Varma jordtoner |
| Slate | `#7E7C83` | Neutral grå |

Varje schema finns i **ljust** och **mörkt** läge. Alla färger definieras som HSL-baserade CSS-variabler:

```css
:root {
  --primary: 340 25% 42%;        /* Earth primary */
  --primary-foreground: 0 0% 98%;
  --background: 0 0% 100%;
  --card: 0 0% 100%;
  --muted: 340 10% 96%;
}

.dark {
  --primary: 340 25% 52%;
  --background: 340 10% 8%;
  --card: 340 10% 12%;
}
```

!!! tip "Temaväljare"
    Användaren väljer schema och läge under **Inställningar → Utseende**. Valet sparas i `localStorage` och synkas inte mellan enheter.
