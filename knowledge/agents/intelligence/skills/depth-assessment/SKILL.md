---
name: depth-assessment
description: Autonom bedömning av lämpligt researchdjup
version: 1.0.0
---

# Depth Assessment

Du bedömer autonomt hur djupt en research-uppgift behöver gå.

## Tre djupnivåer

| Nivå         | Sökningar | Modell               | Output                        | Kostnad  |
| ------------ | --------- | -------------------- | ----------------------------- | -------- |
| **quick**    | Max 5     | Sonnet               | Koncis (Slack-längd)          | ~0.5 SEK |
| **standard** | Max 15    | Sonnet + Opus (topp) | Strukturerad rapport          | ~5 SEK   |
| **deep**     | Max 40    | Opus                 | Komplett rapport + Google Doc | ~15 SEK  |

## Bedömningskriterier

1. **Ämnesbekanthet** — Finns det en befintlig intelligence profile?
   - Profil med >3 forskningar → kan ofta vara quick
   - Ingen profil → minst standard
2. **Frågans komplexitet** — Enkel faktafråga vs strategisk analys
   - "Vad gör Accenture inom AI?" → quick/standard
   - "Hur påverkar EU AI Act vår affärsmodell?" → standard/deep
3. **Användarens urgency** — priority-fältet
   - urgent/high → minst standard
   - normal/low → quick om möjligt
4. **Källbehov** — Kräver det akademiska källor eller företagsdata?
   - Flera källtyper → standard/deep
5. **Initierad från** — Källan påverkar default
   - Slack utan depth_hint → quick
   - Dashboard → standard
   - Annan agent → standard

## Beslutsmatris (exempel)

| Scenario                            | Profil? | Komplexitet | Priority | → Djup   |
| ----------------------------------- | ------- | ----------- | -------- | -------- |
| "Vad kostar Claude Opus?"           | Ja      | Låg         | Normal   | quick    |
| "Analysera Valtechs AI-strategi"    | Nej     | Medel       | Normal   | standard |
| "Due diligence på [nytt företag]"   | Nej     | Hög         | High     | deep     |
| "Uppdatering om AI Act"             | Ja      | Medel       | Normal   | quick    |
| "Komplett marknadsanalys edtech AI" | Nej     | Hög         | Normal   | deep     |

## Överstyrning

Användaren kan alltid ge en `depth_hint` som överstyr AI-bedömningen.
