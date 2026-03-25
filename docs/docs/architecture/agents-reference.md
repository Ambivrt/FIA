# Agentreferens

!!! info "Auto-genererad"
    Denna sida genereras automatiskt från `agent.yaml`-filer. Senast uppdaterad: 2026-03-25

## Analytics Agent (`analytics`)

| Egenskap | Värde |
|----------|-------|
| Version | 1.1.0 |
| Autonomi | autonomous |
| Review rate | 0.05 |
| Eskalerningströskel | 3 |
| Default-modell | claude-sonnet |
| Skills | shared:forefront-identity, shared:data-driven-reasoning, shared:gdpr-compliance, shared:escalation-protocol, agent:reporting, agent:anomaly-detection |
| Tools | gws:analytics, gws:sheets, gws:drive, hubspot |
| Triggers | 1 st |

### Routing

| Uppgiftstyp | Modell |
|-------------|--------|
| default | `claude-sonnet` |
| insights | `claude-opus` |
| report_writing | `claude-opus` |

### Triggers

| Namn | Event | Mål | Godkännande? |
|------|-------|-----|--------------|
| anomaly_escalation | task_completed | #fia-orchestrator | Nej |

---

## Brand Agent (`brand`)

| Egenskap | Värde |
|----------|-------|
| Version | 1.1.0 |
| Autonomi | autonomous |
| Review rate | 0 |
| Eskalerningströskel | 3 |
| Default-modell | claude-opus |
| Skills | shared:forefront-identity, shared:brand-compliance, shared:escalation-protocol, agent:brand-review, agent:quality-scoring |
| Tools | Inga |
| Triggers | 0 st |
| Vetorätt | Ja |

### Routing

| Uppgiftstyp | Modell |
|-------------|--------|
| default | `claude-opus` |

---

## Campaign Agent (`campaign`)

| Egenskap | Värde |
|----------|-------|
| Version | 1.1.0 |
| Autonomi | autonomous |
| Review rate | 0.33 |
| Eskalerningströskel | 3 |
| Default-modell | claude-opus |
| Skills | shared:forefront-identity, shared:brand-compliance, shared:swedish-tone, shared:data-driven-reasoning, shared:escalation-protocol, agent:campaign-execution, agent:ab-testing |
| Tools | hubspot, linkedin, buffer |
| Triggers | 0 st |
| Self-eval | claude-sonnet, tröskel 0.7 |

### Routing

| Uppgiftstyp | Modell |
|-------------|--------|
| default | `claude-opus` |
| ab_variants | `claude-sonnet` |
| segmentation | `claude-sonnet` |

---

## Content Agent (`content`)

| Egenskap | Värde |
|----------|-------|
| Version | 1.1.0 |
| Autonomi | autonomous |
| Review rate | 0.2 |
| Eskalerningströskel | 3 |
| Default-modell | claude-opus |
| Skills | shared:forefront-identity, shared:brand-compliance, shared:swedish-tone, shared:escalation-protocol, agent:content-production, agent:channel-adaptation |
| Tools | buffer, gws:drive, gws:docs |
| Triggers | 0 st |
| Self-eval | claude-sonnet, tröskel 0.7 |

### Routing

| Uppgiftstyp | Modell |
|-------------|--------|
| default | `claude-opus` |
| metadata | `claude-sonnet` |
| alt_text | `claude-sonnet` |
| ab_variants | `claude-sonnet` |
| images | `nano-banana-2` |

---

## Intelligence Agent (`intelligence`)

| Egenskap | Värde |
|----------|-------|
| Version | 1.1.0 |
| Autonomi | autonomous |
| Review rate | 0.2 |
| Eskalerningströskel | 3 |
| Default-modell | claude-sonnet |
| Skills | shared:forefront-identity, shared:data-driven-reasoning, shared:escalation-protocol, agent:source-monitoring, agent:relevance-scoring, agent:briefing-generation |
| Tools | gws:drive, gws:docs, gws:sheets |
| Triggers | 3 st |
| Self-eval | claude-sonnet, tröskel 0.7 |

### Routing

| Uppgiftstyp | Modell |
|-------------|--------|
| default | `claude-sonnet` |
| deep_analysis | `claude-opus` |
| search | `google-search` |

### Triggers

| Namn | Event | Mål | Godkännande? |
|------|-------|-----|--------------|
| rapid_response_to_content | task_completed | content | Nej |
| strategy_input_to_strategy | task_completed | strategy | Ja |
| escalate_critical | task_completed | #fia-orchestrator | Nej |

---

## Lead Agent (`lead`)

| Egenskap | Värde |
|----------|-------|
| Version | 1.1.0 |
| Autonomi | autonomous |
| Review rate | 0.1 |
| Eskalerningströskel | 3 |
| Default-modell | claude-sonnet |
| Skills | shared:forefront-identity, shared:brand-compliance, shared:gdpr-compliance, shared:escalation-protocol, agent:lead-scoring, agent:nurture-sequences |
| Tools | hubspot |
| Triggers | 0 st |

### Routing

| Uppgiftstyp | Modell |
|-------------|--------|
| default | `claude-sonnet` |
| nurture_sequences | `claude-opus` |

---

## SEO Agent (`seo`)

| Egenskap | Värde |
|----------|-------|
| Version | 1.1.0 |
| Autonomi | autonomous |
| Review rate | 0.05 |
| Eskalerningströskel | 3 |
| Default-modell | google-search |
| Skills | shared:forefront-identity, shared:data-driven-reasoning, shared:escalation-protocol, agent:keyword-research, agent:on-page-optimization |
| Tools | gws:analytics, gws:sheets |
| Triggers | 1 st |

### Routing

| Uppgiftstyp | Modell |
|-------------|--------|
| default | `google-search` |
| bulk_optimization | `claude-sonnet` |
| content_recommendations | `claude-opus` |

### Triggers

| Namn | Event | Mål | Godkännande? |
|------|-------|-----|--------------|
| seo_recommendations_to_content | task_approved | content | Ja |

---

## Strategy Agent (`strategy`)

| Egenskap | Värde |
|----------|-------|
| Version | 1.1.0 |
| Autonomi | semi-autonomous |
| Review rate | 1 |
| Eskalerningströskel | 1 |
| Default-modell | claude-opus |
| Skills | shared:forefront-identity, shared:brand-compliance, shared:data-driven-reasoning, shared:escalation-protocol, agent:strategic-planning, agent:market-analysis |
| Tools | gws:analytics, gws:calendar, gws:sheets, hubspot |
| Triggers | 2 st |

### Routing

| Uppgiftstyp | Modell |
|-------------|--------|
| default | `claude-opus` |
| research | `google-search` |
| trend_analysis | `google-search` |

### Triggers

| Namn | Event | Mål | Godkännande? |
|------|-------|-----|--------------|
| brief_to_content | task_activated | content | Nej |
| brief_to_campaign | task_activated | campaign | Ja |

---

