# Agent YAML -- manifestformat

Varje agent styrs av ett manifest i `knowledge/agents/<slug>/agent.yaml`. Manifestet definierar modellval, kontextladdning, verktyg, autonomi och triggers. Gateway:ns agent-loader laser dessa filer vid startup och vid varje task-exekvering.

---

## Komplett annoterat exempel

```yaml
# Agentens visningsnamn
name: Content Agent

# Unik identifierare -- anvands i routing, databas och API
slug: content

# Manifestversion (SemVer)
version: 1.1.0

# Skills som laddas i systemprompt (ordning spelar roll)
skills:
  - shared:forefront-identity    # Delad skill fran knowledge/skills/
  - shared:brand-compliance      # Delad skill
  - shared:swedish-tone          # Delad skill
  - shared:escalation-protocol   # Delad skill
  - agent:content-production     # Agent-specifik fran knowledge/agents/content/skills/
  - agent:channel-adaptation     # Agent-specifik

# Modellval per uppgiftstyp -- routern laser detta falt
routing:
  default: claude-opus           # Standardmodell for alla uppgifter
  metadata: claude-sonnet        # Specifik modell for metadata-generering
  alt_text: claude-sonnet        # Specifik modell for alt-text
  ab_variants: claude-sonnet     # A/B-varianter via Sonnet (kostnadseffektivt)
  images: nano-banana-2          # Bildgenerering

# Systemprompt-kontext (laddas alltid, ordning spelar roll)
system_context:
  - context/tone-examples.md

# Uppgiftsspecifik kontext (laddas on-demand baserat pa task_type)
task_context:
  blog_post:
    - context/templates/blog-post.md
    - context/few-shot/blog-good.md
    - context/few-shot/blog-bad.md
  linkedin:
    - context/templates/linkedin-post.md
    - context/few-shot/linkedin-good.md
    - context/few-shot/linkedin-bad.md
  newsletter:
    - context/templates/newsletter.md
  case_study:
    - context/templates/case-study.md
  whitepaper:
    - context/templates/whitepaper.md

# MCP-verktyg (minsta mojliga rattighet)
tools:
  - buffer                       # Buffer for social media
  - "gws:drive"                  # Google Drive
  - "gws:docs"                   # Google Docs

# Autonominiva
autonomy: autonomous

# Antal avslag fran Brand Agent innan eskalering till Orchestrator
escalation_threshold: 3

# Andel uppgifter som stickprovsgranskas av Orchestrator (0.0-1.0)
sample_review_rate: 0.2

# Max iterationer for self-eval-loopen
max_iterations: 5

# Sjalvutvarderings-konfiguration
self_eval:
  enabled: true
  model: claude-sonnet
  criteria:
    - "Foljer texten tonalitetsreglerna? (konkret, aktivt sprak, tydlig poang)"
    - "Finns pastaenden utan kalla eller stod?"
    - "Passar langd och format for malkanalen?"
  threshold: 0.7

# Filer agenten far skriva till (allt annat ar read-only)
writable:
  - memory/learnings.json
  - memory/feedback-log.json
```

---

## Faltdokumentation

| Falt | Typ | Kravs | Beskrivning |
|------|-----|-------|-------------|
| `name` | `string` | Ja | Agentens visningsnamn. |
| `slug` | `string` | Ja | Unik identifierare. Matchar katalognamn i `knowledge/agents/`. |
| `version` | `string` | Ja | SemVer-version av manifestet. |
| `skills` | `string[]` | Ja | Lista av skills att ladda. Se [Skills-system](#skills-system). |
| `routing` | `object` | Ja | Modellval per uppgiftstyp. Se [Routing-format](#routing-format). |
| `system_context` | `string[]` | Nej | Filer som alltid laddas i systemprompt. Relativa till agentens katalog. |
| `task_context` | `object` | Nej | Map fran task_type till lista av kontextfiler. Laddas on-demand. |
| `tools` | `string[]` | Nej | MCP-verktyg agenten far anvanda. Se [MCP-integrationer](mcp-integrations.md). |
| `autonomy` | `string` | Ja | `autonomous`, `semi-autonomous` eller `manual`. |
| `escalation_threshold` | `number` | Ja | Antal avslag innan eskalering. |
| `sample_review_rate` | `number` | Ja | Andel tasks for stickprov (0.0--1.0). `1.0` = alla kravr godkannande. |
| `max_iterations` | `number` | Nej | Max iterationer i self-eval-loopen (standard: 5). |
| `self_eval` | `object` | Nej | Sjalvutvarderings-konfiguration. Se [Self-eval](#self-eval). |
| `writable` | `string[]` | Nej | Filer agenten far skriva till. Allt annat ar read-only. |
| `triggers` | `object[]` | Nej | Deklarativa triggers. Se [Trigger-schema](#trigger-schema). |
| `has_veto` | `boolean` | Nej | Om agenten har vetorätt (enbart Brand Agent). |
| `budget_limit_sek` | `number` | Nej | Maxbudget per kampanj i SEK (enbart Campaign Agent). |
| `score_threshold_mql` | `number` | Nej | MQL-poangtröskel (enbart Lead Agent). |

---

## Skills-system

Skills laddas i systemprompt och ger agenten kunskap och guardrails.

### Prefix

| Prefix | Sokvag | Beskrivning |
|--------|--------|-------------|
| `shared:` | `knowledge/skills/<namn>.md` | Delade skills som anvands av flera agenter. |
| `agent:` | `knowledge/agents/<slug>/skills/<namn>.md` | Agent-specifika skills. |

### Exempel

```yaml
skills:
  - shared:forefront-identity    # → knowledge/skills/forefront-identity.md
  - shared:brand-compliance      # → knowledge/skills/brand-compliance.md
  - agent:content-production     # → knowledge/agents/content/skills/content-production.md
```

!!! info "Laddningsordning"
    Skills laddas i den ordning de listas i manifestet. Ordningen paverkar prompten -- placera viktigast forst.

---

## Routing-format

Routing-faltet mappar uppgiftstyp till LLM-modell. `default` anvands for alla uppgiftstyper som inte har en specifik mappning.

```yaml
routing:
  default: claude-opus           # Fallback for alla uppgiftstyper
  metadata: claude-sonnet        # Specifik mappning
  images: nano-banana-2          # Bildgenerering
  research: google-search        # Realtidssökning
```

### Giltiga modellalias

| Alias | Modell | Typiskt anvandningsfomrade |
|-------|--------|---------------------------|
| `claude-opus` | Claude Opus 4.6 | Innehall, strategi, analys, Brand-granskning |
| `claude-sonnet` | Claude Sonnet 4.6 | Metadata, scoring, klassificering, A/B-varianter |
| `gemini-pro` | Gemini 2.5 Pro | Fallback for text, djupanalys |
| `gemini-flash` | Gemini 2.5 Flash | Fallback for text, snabba uppgifter |
| `nano-banana-2` | Nano Banana 2 (Gemini 3.1 Flash Image) | Bildgenerering |
| `google-search` | Serper API | Realtidssökning, trendspaning |

!!! warning "Aldrig hardkodat"
    Modellval far aldrig hardkodas i TypeScript-koden. Routern (`src/gateway/router.ts`) laser alltid `routing`-faltet fran manifestet.

---

## Self-eval

Aktiverar automatisk sjalvutvärdering av agentens output innan den skickas vidare.

```yaml
self_eval:
  enabled: true                  # Aktivera/inaktivera
  model: claude-sonnet           # Modell for utvärdering
  criteria:                      # Lista av utvärderingskriterier
    - "Foljer texten tonalitetsreglerna?"
    - "Finns pastaenden utan kalla?"
  threshold: 0.7                 # Minimipoang (0.0-1.0)
```

Om poangen understiger `threshold` gors en ny iteration (upp till `max_iterations`).

---

## Trigger-schema

Triggers definierar deklarativa handlingar som utloses av task-handelser.

```yaml
triggers:
  - name: brief_to_content                        # Unikt namn
    description: "Skapar content-tasks fran brief" # Manniskolas bar beskrivning
    on: task_activated                             # Handelse: task_completed | task_approved | task_activated
    condition:                                     # Villkor for utlosning
      task_type: [campaign_brief]                  # Matchande uppgiftstyper
      output_field: "has_recommendations"          # (valfritt) Falt i output
      output_value: "true"                         # (valfritt) Forväntat varde
      score_field: "severity"                      # (valfritt) Score-falt
      score_above: 0.8                             # (valfritt) Minimipoang
    action:                                        # Handling vid utlosning
      type: create_task                            # create_task | escalate | notify_slack
      target_agent: content                        # Malagent (for create_task)
      task_type: campaign_content                  # Uppgiftstyp att skapa
      priority: normal                             # critical | high | normal | low
      context_fields: [title, content_json]        # Falt att skicka som kontext
      channel: "#fia-orchestrator"                 # Slack-kanal (for notify_slack/escalate)
    requires_approval: false                       # Ska triggern skapa pending_trigger?
    enabled: true                                  # Aktiv/inaktiv
```

!!! note "Trigger-konfiguration"
    Triggers seedas fran `agent.yaml` vid gateway-startup men dashboarden äger konfigurationen efter seed. Andringar i dashboarden skrivs till `config_json.triggers` i Supabase.

---

## Agentmanifest-oversikt

| Agent | Slug | Routing default | Autonomi | Speciellt |
|-------|------|----------------|----------|-----------|
| Strategy | `strategy` | `claude-opus` | semi-autonomous | `sample_review_rate: 1.0` -- alla planer kravr godkannande |
| Content | `content` | `claude-opus` | autonomous | Few-shot (bra/daligt), bilder via Nano Banana 2 |
| Campaign | `campaign` | `claude-opus` | autonomous | `budget_limit_sek: 10000` per kampanj |
| SEO | `seo` | `google-search` | autonomous | Keyword-rankings i memory |
| Lead | `lead` | `claude-sonnet` | autonomous | `score_threshold_mql: 75` |
| Analytics | `analytics` | `claude-sonnet` | autonomous | Skriver KPI-data till Supabase |
| Brand | `brand` | `claude-opus` | autonomous | `has_veto: true` -- vetorätt pa allt innehall |
| Intelligence | `intelligence` | `claude-sonnet` | autonomous | Omvarldsbevaking, 3 triggers |
