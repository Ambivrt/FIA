# Forefronts planeringsramverk

## Principer

1. **Datadriven prioritering** – Alla beslut baseras på GA4, HubSpot och interna KPI:er. Magkänsla är tillåtet, men ska stödjas av data.

2. **Varumärke före volym** – Långsiktig varumärkesbyggnad prioriteras framför kortsiktiga leads. Bättre att publicera 2 exceptionella artiklar än 10 mediokra.

3. **Iterativ planering** – Kvartalsplaner sätter riktning, men månadsplaner justeras baserat på resultat. Flexibilitet inom ramverket.

4. **Mätbar framgång** – Varje aktivitet har en mätbar KPI. Om vi inte kan mäta det, ska vi ifrågasätta om vi ska göra det.

## Planeringscykel

```
Kvartal → Kvartalsplan (Strategy Agent → Orchestrator godkänner)
    ↓
Månad → Månadsplan (Strategy Agent → Orchestrator godkänner)
    ↓
Vecka → Veckoplanering (automatisk baserad på månadsplan)
    ↓
Dag → Morgonpuls (Analytics Agent → #fia-orchestrator)
```

## Prioriteringsmatris

| Hög påverkan + Låg insats     | Hög påverkan + Hög insats     |
| ----------------------------- | ----------------------------- |
| Gör direkt                    | Planera noggrant              |
| **Låg påverkan + Låg insats** | **Låg påverkan + Hög insats** |
| Automatisera eller delegera   | Avvakta eller skippa          |

## Fokusområden per kvartal

Varje kvartal har max 3 fokusområden. Välj baserat på:

- Affärsmål och pipeline-behov
- Säsongsvariation och marknadstrender
- Resultat från föregående kvartal
- Tillgängliga resurser och agentkapacitet

## KPI-hierarki

1. **Norrstjärna:** Pipeline-bidrag i SEK
2. **Primära:** MQL:er, organisk trafik, konverteringsgrad
3. **Sekundära:** Publicerat innehåll, engagemang, brand awareness
4. **Operativa:** Godkännandegrad, agentupptid, LLM-kostnad

## Kanalstrategi

Varje kanal har sin egen strategisk ram. Se `channel-overview.md` för fullständig kanalöversikt.

### Strateginivåer

- **Övergripande:** channel_strategy (generisk, parameterstyrd via `channel`-fält)
- **SoMe-specifik:** some_strategy (LinkedIn-fokuserad, egen template)
- **Annonsspecifik:** ads_strategy (LinkedIn Ads + Google Ads, egen template)
- **Övriga kanaler:** Hanteras via channel_strategy med rätt kanalparameter

### Kanalval-principer

1. Välj kanal baserat på målgrupp och affärsmål
2. Max 2-3 primära kanaler per kampanj
3. Återanvänd content cross-channel
4. Earned media hanteras som taktik inom kampanjbrief

## Budgetfördelning

### Budget-trösklar

- Under 10 000 SEK: Strategy Agent beslutar autonomt
- 10 000–50 000 SEK: Orchestrator-godkännande
- Över 50 000 SEK: Eskalera till ledningsgrupp

### Fördelningsmodell

Budgetfördelning baseras på historisk ROI per kanal. Varje budget_allocation inkluderar tre scenarion: konservativ (-20%), neutral och aggressiv (+30%).

## Konkurrentrespons

### Process

1. Intelligence Agent detekterar konkurrentaktivitet
2. competitive_alert trigger skapar competitive_response task (via godkännande)
3. Strategy Agent levererar utkast inom 24h
4. Fokus på differentiering — aldrig imitation

### Eskalering

- Kritisk konkurrenthändelse → eskalera direkt till Orchestrator
- Behov av strategisk pivot → eskalera automatiskt

## Målgruppsarbete

### Ramverk

- Max 3 primära personas baserade på HubSpot CRM-data
- Buyer journey-mapping per segment (awareness → decision → expansion)
- Segmentering: bransch × företagsstorlek × roll
- Koppla varje pain point till Forefronts lösning

### Uppdateringscykel

- Personas uppdateras kvartalsvis
- Segmentdata refreshas månadsvis via Analytics Agent
