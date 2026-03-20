---
name: relevance-scoring
description: Bedömning av omvärldsfynd med tvåstegs-scoring
version: 1.0.0
---

# Relevance Scoring

Du bedömer relevansen av omvärldsfynd för Forefront Consulting Group.
Scoring sker i två steg: signalscoring (snabb, alla resultat) och djupanalys
(selektiv, enbart högrelevanta).

## Steg 1: Signalscoring

Bedöm VARJE resultat på fyra dimensioner (0.0–1.0):

### domain_relevance (vikt: 0.35)

Hur starkt relaterar innehållet till bevakningsdomänen?

- 0.0 = ingen koppling
- 0.5 = tangerar ämnet
- 1.0 = direkt träff på primärt keyword eller namngiven entity

### forefront_impact (vikt: 0.30)

Hur mycket påverkar detta Forefront specifikt?

- 0.0 = generell branschnyhet utan koppling
- 0.5 = påverkar vår typ av verksamhet (konsulting, AI, transformation)
- 1.0 = direkt konkurrentrörelse, Forefront namngivet, eller hot/möjlighet

### actionability (vikt: 0.20)

Kan Forefront agera på detta?

- 0.0 = rent informativt, inget att göra
- 0.5 = input till strategi eller planering
- 1.0 = kräver eller möjliggör omedelbar handling (replik, positionering, erbjudande)

### recency_novelty (vikt: 0.15)

Är det nytt och oväntat?

- 0.0 = gammal/känd information
- 0.5 = känt ämne, ny vinkel
- 1.0 = breaking news, oväntat

### Composite score

`score = (domain_relevance * 0.35 + forefront_impact * 0.30 + actionability * 0.20 + recency_novelty * 0.15) * domain_weight`

Där `domain_weight` hämtas från watch-domains.yaml.

### Filtrering

- score < 0.6 → ignoreras
- score 0.6–0.69 → inkluderas i brief med enrads-sammanfattning
- score >= 0.7 → skickas vidare till Steg 2 (djupanalys)

## Steg 2: Djupanalys (claude-opus)

Körs ENBART på resultat med signal_score >= 0.7.

Generera:

- **summary**: 2–3 meningars sammanfattning
- **implications**: Vad betyder detta för Forefront? Specifikt och konkret.
- **suggested_action**: EN av: `brief`, `rapid_response`, `strategy_input`, `escalate`
- **confidence**: 0.0–1.0 (din bedömning av analysens kvalitet)
- **sources**: Lista med URL:er

### Suggested action-regler

- `escalate` (priority: urgent): Konkurrent namnger Forefront, kris, regulatorisk förändring
- `rapid_response` (priority: high): Konkurrent lanserar överlappande tjänst, branschrapport publicerad, möjlighet att positionera
- `strategy_input` (priority: normal): LLM-prisändring >20%, marknadsförskjutning, ny teknologi
- `brief` (priority: normal): Default – informativt, ingen omedelbar handling
