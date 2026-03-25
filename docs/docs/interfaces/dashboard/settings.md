# Dashboard – Inställningar

Inställningssidan samlar systemkritiska kontroller, utseendeval och administratörsfunktioner.

---

## Kill Switch

Kill switch stoppar **alla agenter omedelbart**. Inga nya tasks startas och pågående tasks pausas.

| Egenskap | Värde |
|----------|-------|
| Lagringsplats | `system_settings`-tabell i Supabase |
| Nyckel | `kill_switch` |
| Typ | Boolean |
| Dubbel aktivering | Dashboard + Slack (`/fia kill`) |

```
┌────────────────────────────────────────────┐
│ Kill Switch                                │
│                                            │
│ ┌──────────────────────────────────────┐   │
│ │  ○ ───────────────────── ● AKTIV     │   │
│ └──────────────────────────────────────┘   │
│                                            │
│ ⚠ Alla agenter stoppas omedelbart.         │
│   Aktiverad av: anna@forefront.se          │
│   Tidpunkt: 2026-03-25 09:15:03            │
└────────────────────────────────────────────┘
```

!!! danger "Dubbel bekräftelse"
    Aktivering av kill switch kräver en bekräftelsedialog: _"Är du säker? Alla agenter stoppas omedelbart."_ Avaktivering kräver liknande bekräftelse.

### Aktivera / avaktivera

| Åtgärd | Effekt |
|--------|--------|
| **Aktivera** | Alla agenters display status → `killed`. Inga tasks körs. |
| **Avaktivera** | Agenter återgår till sin normala status. Köade tasks börjar bearbetas. |

!!! note "Slack-synk"
    Kill switch kan aktiveras/avaktiveras från både Dashboard och Slack. Oavsett var ändringen görs synkas statusen i realtid till båda gränssnitten via Supabase Realtime.

---

## Temaväljare

### Färgscheman

| Schema | Primärfärg | HSL |
|--------|-----------|-----|
| **Earth** | Forefront vinröd | `340 25% 42%` |
| **Ocean** | Blålila | `230 18% 40%` |
| **Forest** | Djupgrön | `160 10% 29%` |
| **Sand** | Varmbrun | `25 15% 40%` |
| **Slate** | Neutral grå | `260 2% 50%` |

### Lägen

Varje schema finns i **ljust** och **mörkt** läge. Totalt 10 kombinationer.

```
┌────────────────────────────────────────────┐
│ Utseende                                   │
│                                            │
│ Färgschema:  [Earth ▾]                     │
│                                            │
│ Läge:        ○ Ljust   ● Mörkt            │
│                                            │
│ Förhandsgranskning:                        │
│ ┌──────────────────────────────────────┐   │
│ │  ████ ████ ████ ████ ████           │   │
│ │  Primär  Sekundär  Bakgrund  Text   │   │
│ └──────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

!!! tip "Sparas lokalt"
    Temavalet lagras i `localStorage` och tillämpas direkt via CSS-variabler. Ingen serversynk behövs.

---

## Språkväljare

Dashboarden stöder **svenska** (standard) och **engelska** via i18next.

| Inställning | Värde |
|-------------|-------|
| Standardspråk | `sv` |
| Fallback-språk | `en` |
| Översättningsfiler | `src/locales/sv.json`, `src/locales/en.json` |
| Antal nycklar | 40+ |

```typescript
// Användning i komponenter
const { t } = useTranslation();
return <h1>{t('settings.title')}</h1>;
```

!!! note "Språkdetektering"
    Språkvalet sparas i `localStorage`. Vid första besöket används webbläsarens språkinställning.

---

## Knowledge Library

Administratörer kan populera kunskapsbiblioteket i Supabase från gateway-serverns filer.

### Kunskapstyper

| Typ | Källa | Beskrivning |
|-----|-------|-------------|
| `skills` | `SKILL.md` | Agentens roll och guardrails |
| `system_context` | `knowledge/brand/*.md` | Delad varumärkeskontext |
| `task_context` | `context/*.md` | Uppgiftsspecifika mallar |
| `few_shot` | `context/few-shot-*.md` | Exempel-par för LLM |
| `memory` | `memory/*.md` | Agentens skrivbara minne |

### Populera från server

!!! warning "Endast admin"
    Knappen "Populera från server" kräver rollen `admin`.

```
1. Admin klickar "Populera från server" i Knowledge Library
2. Dashboard skickar `reseed_knowledge`-kommando via Supabase Realtime
3. Gateway läser alla kunskapsfiler från disk
4. Upsert till `agent_knowledge`-tabellen
5. Resultat visas: antal tillagda/uppdaterade/oförändrade
```

!!! failure "Felhantering"
    Om reseed misslyckas (t.ex. filsystemfel på servern) returneras ett felmeddelande som visas i dashboarden. `emitCommand` returnerar felstatus så att knappen kan visa relevant information.

---

## Rollhantering

FIA använder fyra roller med olika behörighetsnivåer.

| Roll | Beskrivning | Kill switch | Godkänna tasks | Redigera config | Reseed |
|------|------------|-------------|---------------|-----------------|--------|
| `orchestrator` | Marketing Orchestrator | ✓ | ✓ | ✓ | ✓ |
| `admin` | Systemadministratör | ✓ | ✓ | ✓ | ✓ |
| `operator` | Daglig operatör | ✗ | ✓ | ✗ | ✗ |
| `viewer` | Skrivskyddad åtkomst | ✗ | ✗ | ✗ | ✗ |

!!! info "Rollkälla"
    Roller tilldelas via Supabase Auth metadata och valideras av RLS-policies på databasnivå. Rollbyten görs direkt i Supabase Dashboard eller via SQL.
