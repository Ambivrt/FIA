# Dashboard – Godkännanden

Godkännandesidan är köpunkten mellan agenternas autonoma arbete och mänsklig kvalitetskontroll. Alla tasks som kräver granskning hamnar här.

---

## ApprovalsPage (`/approvals`)

Visar en filtrerbara lista över tasks med status `awaiting_review`.

### Filter

| Filter      | Alternativ                                         | Standard     |
| ----------- | -------------------------------------------------- | ------------ |
| Agent       | Alla / enskild agent                               | Alla         |
| Uppgiftstyp | `blog_post`, `social_post`, `email_sequence`, etc. | Alla         |
| Prioritet   | `low`, `normal`, `high`, `critical`                | Alla         |
| Sortering   | Skapad (nyaste/äldsta), prioritet                  | Nyaste först |

### Listvy

Varje rad visar:

- `TaskStatusBadge` med aktuell status
- Agentnamn och slug
- Uppgiftstyp
- Prioritet (färgkodad)
- Skapad tidsstämpel
- Knapp: **Granska →**

!!! info "Realtidsuppdatering"
Listan uppdateras automatiskt via Supabase Realtime. Nya tasks dyker upp utan sidladdning.

---

## TaskDetailSheet

Klicka på en task för att öppna `TaskDetailSheet` – en sidopanel (Sheet/Drawer) med fullständiga detaljer.

### Sektioner

#### 1. Metadata

| Fält          | Beskrivning                            |
| ------------- | -------------------------------------- |
| Task-ID       | UUID                                   |
| Agent         | Namn + slug                            |
| Uppgiftstyp   | T.ex. `blog_post`                      |
| Prioritet     | `low` / `normal` / `high` / `critical` |
| Status        | Aktuell status med badge               |
| Skapad        | Tidsstämpel                            |
| Uppdaterad    | Tidsstämpel                            |
| Förälder-task | Länk till parent_task_id (om finns)    |
| Barn-tasks    | Lista med children (om finns)          |

#### 2. Innehållsförhandsgranskning

Visar `content_json` renderat som formatterad text. Innehåller typiskt:

- **Rubrik** (H1)
- **Brödtext** (Markdown-renderad)
- **Meta-description**
- **Nyckelord / taggar**
- **Self-eval score** (poäng från agentens egen utvärdering)

```json
{
  "title": "Hur AI förändrar B2B-marknadsföring",
  "body": "## Inledning\nArtificiell intelligens...",
  "meta_description": "Lär dig hur AI effektiviserar...",
  "keywords": ["AI", "B2B", "marknadsföring"],
  "self_eval_score": 0.87
}
```

#### 3. Granskningshistorik

Visar tidigare granskningsomgångar (om tasken skickats tillbaka med feedback):

| Omgång | Granskare   | Resultat | Feedback               | Tidsstämpel      |
| ------ | ----------- | -------- | ---------------------- | ---------------- |
| 1      | Brand Agent | Revision | "Tonen är för formell" | 2026-03-24 14:30 |
| 2      | Brand Agent | Godkänd  | —                      | 2026-03-24 14:45 |

!!! warning "Tre strikes-regeln"
Om Brand Agent underkänner en task tre gånger eskaleras den automatiskt till Marketing Orchestrator. Tasken får då status `escalated`.

---

## TaskStatusBadge

Visar en av 17 möjliga statusar med unik ikon och färg.

### Statusar

| Status               | Ikon | Färg   | Beskrivning                 |
| -------------------- | ---- | ------ | --------------------------- |
| `queued`             | ⏳   | Grå    | Väntar i kö                 |
| `in_progress`        | ▶    | Blå    | Pågår                       |
| `completed`          | ✓    | Grön   | Slutförd (intern)           |
| `awaiting_review`    | 👁   | Gul    | Väntar på granskning        |
| `revision_requested` | ↩    | Orange | Revision begärd             |
| `approved`           | ✓✓   | Grön   | Godkänd                     |
| `rejected`           | ✗    | Röd    | Underkänd                   |
| `delivered`          | 📬   | Grön   | Publicerad/levererad        |
| `failed`             | ⚠    | Röd    | Misslyckad                  |
| `cancelled`          | ○    | Grå    | Avbruten                    |
| `escalated`          | ⬆    | Orange | Eskalerad till orchestrator |
| `paused`             | ⏸    | Gul    | Pausad                      |
| `scheduled`          | 📅   | Blå    | Schemalagd                  |
| `blocked`            | 🚫   | Röd    | Blockerad av beroende       |
| `retrying`           | 🔄   | Gul    | Försöker igen               |
| `screening`          | 🔍   | Blå    | Pre-screening (Brand Agent) |
| `staging`            | 📦   | Blå    | Innehåll förbereds          |

---

## Godkänna / avvisa / begära revision

### Godkänna

```
┌─────────────────────────────────────────────┐
│ TaskDetailSheet                             │
│                                             │
│ [Innehåll renderat...]                      │
│                                             │
│ ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│ │ Godkänn │  │ Revision │  │  Avvisa    │  │
│ └─────────┘  └──────────┘  └────────────┘  │
└─────────────────────────────────────────────┘
```

| Åtgärd             | Statusövergång                           | Kräver feedback |
| ------------------ | ---------------------------------------- | --------------- |
| **Godkänn**        | `awaiting_review` → `approved`           | Nej             |
| **Begär revision** | `awaiting_review` → `revision_requested` | Ja              |
| **Avvisa**         | `awaiting_review` → `rejected`           | Ja              |

!!! example "Begära revision" 1. Öppna task i TaskDetailSheet 2. Klicka **Revision** 3. Skriv feedback: _"Rubrik saknar sökord. Lägg till 'AI-marknadsföring' i H1."_ 4. Bekräfta 5. Tasken skickas tillbaka till agenten med feedbacken

---

## Content staging (Fas 2)

!!! abstract "Planerat"
I Fas 2 kommer `TaskDetailSheet` att inkludera en **staging-preview** som visar innehållet exakt som det kommer att publiceras – med Zod-validering av `content_json`-schemat och förhandsvisning av bilder, formatering och metadata.
