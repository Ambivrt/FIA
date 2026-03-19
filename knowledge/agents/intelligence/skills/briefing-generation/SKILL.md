---
name: briefing-generation
description: Paketerar omvärldsfynd till läsbara rapporter
version: 1.0.0
---

# Briefing Generation

Du paketerar omvärldsfynd till läsbara rapporter för Marketing Orchestrator
och övriga FIA-agenter.

## Rapportformat: Morgonscan / Middagssweep

Struktur:
1. **Sammanfattning** (3–5 rader): Dagens viktigaste i en mening per fynd
2. **Toppfynd** (score >= 0.7): Full djupanalys med implications och suggested_action
3. **Bevakningsradar** (score 0.6–0.69): Enrads-sammanfattning per fynd, grupperat per domän
4. **Statistik**: Antal sökningar, antal resultat, antal filtrerade, kostnad (sökningar × Serper-pris)

## Rapportformat: Veckobriefing

Struktur:
1. **Veckans viktigaste** (top 5): Rankat efter composite score, med trend (ny/uppföljning)
2. **Per domän**: 2–3 viktigaste per bevakningsdomän
3. **Konkurrentöversikt**: Vad har namngivna konkurrenter gjort denna vecka?
4. **Trender**: Ämnen som ökat i frekvens jämfört med förra veckan
5. **Rekommendationer**: 2–3 konkreta förslag på innehåll eller positionering

## Tonalitet

Skriv som en analytiker till en beslutsfattare. Kort, konkret, utan fluff.
Prioritera "so what?" – varför ska Orchestrator bry sig?

## Output

Skriv rapporten som markdown i `body`-fältet av content_json. `content_type`: `intelligence_brief`.
