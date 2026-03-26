# knowledge/ – FIA kunskapsbas

Filbaserad kunskapsbas (markdown, YAML, JSON). Ingen vektordatabas. Agent-loader (`src/agents/agent-loader.ts`) läser och resolvar alla sökvägar.

## Struktur

```
knowledge/
├── brand/                   # Delad varumärkeskontext (laddas av ALLA agenter)
│   ├── platform.md          # Varumärkesplattform
│   ├── tonality.md          # Tonalitetsregler och exempel
│   ├── visual.md            # Visuell identitet
│   └── messages.md          # Budskapshierarki nivå 1–3
│
├── skills/                  # Delade skills (shared:)
│   ├── forefront-identity/  # Alla agenter
│   ├── brand-compliance/    # Content, Brand, Campaign, Lead, Strategy
│   ├── swedish-tone/        # Content, Campaign
│   ├── data-driven-reasoning/ # Strategy, Campaign, SEO, Analytics, Intelligence
│   ├── escalation-protocol/ # Alla agenter
│   └── gdpr-compliance/     # Lead, Analytics
│
└── agents/<slug>/           # Per agent (8 st)
    ├── agent.yaml           # Manifest (KRITISK – styr allt)
    ├── SKILL.md             # Legacy – ersätts av skills/-fältet
    ├── skills/              # Agentspecifika skills (agent:)
    │   └── <skill>/SKILL.md
    ├── context/             # Mallar, few-shot, riktlinjer (read-only)
    │   ├── templates/       # Strukturerade mallar per uppgiftstyp
    │   └── few-shot/        # Bra/dåliga exempel
    └── memory/              # Ackumulerat minne (skrivbart av agenten)
```

## agent.yaml – manifestformat (v1.1.0)

Manifestet är centralt. Det styr modellval, kontextladdning, verktyg och autonomi.

```yaml
name: Content Agent
slug: content
version: 1.1.0

skills: # Modulärt skill-system
  - shared:forefront-identity # Prefix shared: eller agent:
  - agent:content-production

routing:
  default: claude-opus # Enkel sträng (legacy)
  deep_analysis: # Objekt med fallback
    primary: claude-opus
    fallback: claude-sonnet

system_context: # Alltid i systemprompt (ordning spelar roll)
  - context/tone-examples.md

task_context: # On-demand baserat på uppgiftstyp
  blog_post:
    - context/templates/blog-post.md
    - context/few-shot/blog-good.md

tools: # MCP-verktyg (minsta möjliga rättighet)
  - gws:docs

autonomy: autonomous # autonomous | semi-autonomous | manual
escalation_threshold: 3 # Avslag innan eskalering
sample_review_rate: 0.2 # Stickprovsgranskning

writable: # Enbart listade filer kan skrivas av agenten
  - memory/learnings.json

triggers: # Deklarativa triggers (seedas till Supabase)
  - name: example_trigger
    on: task_completed
    condition: { task_type: [blog_post] }
    action: { type: create_task, target_agent: content, task_type: seo_optimization }
    requires_approval: true
    enabled: true
```

### Nyckelregler

- **routing** – Aldrig hårdkodas i TypeScript. Routern läser detta fält. Stöder `{ primary, fallback }`.
- **skills** – Prefix `shared:` för delade, `agent:` för agentspecifika. Resolvas från `knowledge/skills/` resp `knowledge/agents/<slug>/skills/`.
- **system_context** – Hålls kompakt. Prompt-cachas.
- **task_context** – Laddas enbart vid matchande uppgiftstyp (sparar tokens).
- **writable** – Enbart listade filer kan skrivas av agenten.
- **tools** – `gws:<tjänst>` refererar till specifika Google Workspace-tjänster.
- **triggers** – Seedas till `config_json.triggers` i Supabase vid startup. Dashboarden äger efter seed.

## Agenter

Åtta agenter under `knowledge/agents/<slug>/`.

| Slug         | Namn               | Routing default | Autonomi        | Speciellt                                                              |
| ------------ | ------------------ | --------------- | --------------- | ---------------------------------------------------------------------- |
| strategy     | Strategy Agent     | claude-opus     | semi-autonomous | `sample_review_rate: 1.0` (alla planer godkänns)                       |
| content      | Content Agent      | claude-opus     | autonomous      | Few-shot, metadata via Sonnet, bilder via Nano Banana                  |
| campaign     | Campaign Agent     | claude-opus     | autonomous      | `budget_limit_sek: 10000` per kampanj                                  |
| seo          | SEO Agent          | google-search   | autonomous      | Keyword-rankings i memory                                              |
| lead         | Lead Agent         | claude-sonnet   | autonomous      | `score_threshold_mql: 75`                                              |
| analytics    | Analytics Agent    | claude-sonnet   | autonomous      | Skriver KPI-data till Supabase                                         |
| brand        | Brand Agent        | claude-opus     | autonomous      | `has_veto: true`, granskar allt content                                |
| intelligence | Intelligence Agent | claude-sonnet   | autonomous      | v2.0.0: 10 jobbtyper, adaptivt djup, intelligence profiles, 7 triggers |

## Agentflöde

```
Trigger (cron/Slack/agent/CLI) → Gateway → agent-loader → router → LLM-anrop
  → Brand Agent granskar (vid publicering)
  → Godkänt → Publicera via MCP
  → Underkänt → Tillbaka med feedback (3x → eskalera till Orchestrator)
```

### Intelligence Agent pipeline

**Scan-pipeline (morning_scan, midday_sweep, weekly_intelligence):**

1. **Gather** – Söker bevakningsdomäner via Serper. Dedup mot `source-history.json` (72h fönster). Mergar temporära watch-domains.
2. **Signal scoring** – Sonnet bedömer fynd på 4 dimensioner via `signal_scoring` tool_use.
3. **Deep analysis** – Opus djupanalyserar fynd med score ≥ 0.7 via `deep_analysis` tool_use.
4. **Rapid response** – `suggested_action: rapid_response` → high-priority task åt Content Agent.
5. **Briefing** – Opus genererar strukturerad rapport med toppfynd och statistik + research-förslag.

**Research-pipeline (6 nya jobbtyper v2.0.0):**

1. **Depth assessment** – AI bedömer quick/standard/deep baserat på komplexitet, profil, priority.
2. **Gather** – Multi-source sökning (webb, jobbsajter, akademiskt, företagsregister) anpassad per jobbtyp.
3. **Checkpoint** – Vid deep: pausar efter gathering (awaiting_input) för bekräftelse.
4. **Analyze** – Scorar och djupanalyserar (Sonnet→Opus beroende på djup).
5. **Compile** – Genererar basstruktur + jobbtyp-specifik modul (SWOT/timeline/scorecard/talent_matrix/company_profile).
6. **Profile** – Uppdaterar intelligence profile i Supabase för ackumulerad kunskap.

**Intelligence Profiles:** Supabase-tabell (`intelligence_profiles`) med FTS. Byggs över tid per ämne/företag/trend.

**Sub-statusar:** `gathering` → `analyzing` → `compiling` (+ `awaiting_input` vid deep checkpoint).

### Aktiva triggers (11 st)

| Agent        | Trigger                        | Event          | Auto? |
| ------------ | ------------------------------ | -------------- | ----- |
| Intelligence | rapid_response_to_content      | task_completed | Ja    |
| Intelligence | strategy_input_to_strategy     | task_completed | Nej   |
| Intelligence | escalate_critical              | task_completed | Ja    |
| Intelligence | research_to_content            | task_completed | Nej   |
| Intelligence | research_to_lead               | task_completed | Nej   |
| Intelligence | research_to_seo                | task_completed | Nej   |
| Intelligence | research_urgency_alert         | task_completed | Ja    |
| Strategy     | brief_to_content               | task_activated | Ja    |
| Strategy     | brief_to_campaign              | task_activated | Nej   |
| Analytics    | anomaly_escalation             | task_completed | Ja    |
| SEO          | seo_recommendations_to_content | task_approved  | Nej   |

## Varumärkeskontext (brand/)

Laddas av alla innehållsagenter via prompt-builder. Filer i `brand/` ändras sällan.

- **platform.md** – Varför Forefront finns, löfte, övertygelser
- **tonality.md** – Tonregler, exempel på bra/dålig ton
- **visual.md** – Färger, typsnitt, logotyp
- **messages.md** – Hero-budskap, nivå 2–3 budskap
