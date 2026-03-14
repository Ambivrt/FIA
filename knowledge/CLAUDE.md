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
└── agents/<slug>/           # Per agent (7 st)
    ├── agent.yaml           # Manifest (KRITISK – styr allt)
    ├── SKILL.md             # Roll, mål, guardrails
    ├── context/             # Mallar, few-shot, riktlinjer (read-only)
    │   ├── templates/       # Strukturerade mallar per uppgiftstyp
    │   └── few-shot/        # Bra/dåliga exempel
    └── memory/              # Ackumulerat minne (skrivbart av agenten)
```

## agent.yaml – manifestformat

Manifestet är centralt. Det styr modellval, kontextladdning, verktyg och autonomi.

```yaml
name: Content Agent
slug: content
version: 1.0.0

# Modellval per uppgiftstyp → styr routern
routing:
  default: claude-opus
  metadata: claude-sonnet
  images: nano-banana-2

# Alltid i systemprompt (ordning spelar roll)
system_context:
  - SKILL.md
  - context/tone-examples.md

# Laddas on-demand baserat på uppgiftstyp
task_context:
  blog_post:
    - context/templates/blog-post.md
    - context/few-shot/blog-good.md

# MCP-verktyg (minsta möjliga rättighet)
tools:
  - wordpress
  - gws:docs

# Guardrails
autonomy: autonomous          # autonomous | semi-autonomous | manual
escalation_threshold: 3       # Avslag innan eskalering
sample_review_rate: 0.2       # Stickprovsgranskning av Orchestrator

# Skrivbara filer (allt annat read-only)
writable:
  - memory/learnings.json
```

### Nyckelregler

- **routing** – Aldrig hårdkodas i TypeScript. Routern läser detta fält.
- **system_context** – Hålls kompakt. Prompt-cachas.
- **task_context** – Laddas enbart vid matchande uppgiftstyp (sparar tokens).
- **writable** – Enbart listade filer kan skrivas av agenten.
- **tools** – `gws:<tjänst>` refererar till specifika Google Workspace-tjänster.

## Agentöversikt

| Slug | Routing default | Speciellt |
|------|----------------|-----------|
| strategy | claude-opus | `sample_review_rate: 1.0` (alla planer kräver godkännande) |
| content | claude-opus | Few-shot (bra/dåligt), metadata via Sonnet, bilder via Nano Banana |
| campaign | claude-opus | `budget_limit_sek: 10000` per kampanj |
| seo | perplexity | Keyword-rankings ackumuleras i memory |
| lead | claude-sonnet | `score_threshold_mql: 75` |
| analytics | claude-sonnet | Skriver KPI-data till Supabase |
| brand | claude-opus | `has_veto: true`, använder alltid Opus |

## Varumärkeskontext (brand/)

Laddas av alla innehållsagenter via prompt-builder. Filer i `brand/` ändras sällan – behandla som referensmaterial.

- **platform.md** – Varför Forefront finns, löfte, övertygelser
- **tonality.md** – Tonregler, exempel på bra/dålig ton
- **visual.md** – Färger, typsnitt, logotyp
- **messages.md** – Hero-budskap, nivå 2–3 budskap
